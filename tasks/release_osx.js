'use strict';

const Q = require('q');
const jetpack = require('fs-jetpack');
const { replace } = require('./utils');

let projectDir;
let releasesDir;
let tmpDir;
let finalAppDir;
let manifest;
let node_modules_dir;

const init = function (params={}) {
    projectDir = params.projectDir || jetpack;
    tmpDir = params.tmpDir || projectDir.dir('./tmp', { empty: true });
    releasesDir = params.releasesDir || projectDir.dir('./releases');
    manifest = params.manifest || projectDir.read('package.json', 'json');
    node_modules_dir = params.node_modules_dir || 'node_modules';

    finalAppDir = tmpDir.cwd(manifest.productName + '.app');
    return Q();
};

const copyRuntime = function () {
    // When copying files, ignore `ljproj` files. Otherwise, the application
    // name will show up as 'nwjs'. Thanks to
    // https://github.com/nwjs-community/nw-builder/
    console.log(`Copying runtime file nwjs.app from ${projectDir.path(node_modules_dir)}/nw/nwjs...`);

    return projectDir.copyAsync(`${node_modules_dir}/nw/nwjs/nwjs.app`,
        finalAppDir.path(),
        {
            overwrite: true,
            matching: [ 'Contents/**/*', '!Contents/Resources/*.lproj/*' ]
        });
};

const copyBuiltApp = function () {
    console.log(`Copying /build contents into app.nw`);
    return projectDir.copyAsync('build', finalAppDir.path('Contents/Resources/app.nw'));
};

const prepareOsSpecificThings = function () {
    // Info.plist
    console.log('Doing OSX-specific things...');
    // Patch the runtime's own Info.plist rather than replacing it with the
    // resources/osx template, which predates current nw.js/Chromium. (Untested
    // whether the template alone would still work with nw 0.104.)
    const plist = finalAppDir.path('Contents/Info.plist');
    const setKey = (k, v) => {
        const cp = require('child_process');
        try {
            cp.execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${k} ${v}`, plist]);
        } catch (e) {
            cp.execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${k} string ${v}`, plist]);
        }
    };
    setKey('CFBundleName', manifest.productName);
    setKey('CFBundleDisplayName', manifest.productName);
    setKey('CFBundleExecutable', manifest.productName);
    setKey('CFBundleIdentifier', 'com.cryptotrust.onlykey');
    setKey('CFBundleShortVersionString', manifest.version);
    setKey('CFBundleVersion', manifest.version);
    setKey('CFBundleIconFile', 'icon.icns');

    // Icon
    projectDir.copy('resources/osx/icon.icns', finalAppDir.path('Contents/Resources/icon.icns'));

    // Rename executable, so it looks nice in the installer
    jetpack.rename(finalAppDir.path('Contents/MacOS/nwjs'), manifest.productName);

    return Q();
};

const signApp = function () {
    // Ad-hoc signature: required for arm64 binaries to run, and lets
    // `codesign --verify` pass. Replace '-' with a Developer ID to distribute.
    console.log('Ad-hoc signing...');
    require('child_process').execFileSync('codesign',
        ['--force', '--deep', '-s', '-', finalAppDir.path()], { stdio: 'inherit' });
    return Q();
};

const packToDmgFallback = function (dmgName) {
    // appdmg has native deps that do not always build; plain hdiutil always works.
    const cp = require('child_process');
    const stage = tmpDir.dir('dmg-stage', { empty: true });
    cp.execFileSync('ditto', [finalAppDir.path(), stage.path(manifest.productName + '.app')]);
    cp.execFileSync('ln', ['-s', '/Applications', stage.path('Applications')]);
    releasesDir.remove(dmgName);
    cp.execFileSync('hdiutil', ['create', '-volname', manifest.productName,
        '-srcfolder', stage.path(), '-format', 'UDZO', releasesDir.path(dmgName)],
        { stdio: 'inherit' });
    console.log('DMG file ready!', releasesDir.path(dmgName));
    return Q();
};

const packToDmgFile = function () {
    const deferred = Q.defer();

    let appdmg;
    try {
        appdmg = require('appdmg');
    } catch (e) {
        console.log('appdmg not available, using hdiutil');
        return packToDmgFallback(manifest.name + '_' + manifest.version + '.dmg');
    }
    const dmgName = manifest.name + '_' + manifest.version + '.dmg';

    // Prepare appdmg config
    let dmgManifest = projectDir.read('resources/osx/appdmg.json');
    dmgManifest = replace(dmgManifest, {
        productName: manifest.productName,
        appPath: finalAppDir.path(),
        dmgIcon: projectDir.path("resources/osx/dmg-icon.icns"),
        dmgBackground: projectDir.path("resources/osx/dmg-background.png")
    });
    tmpDir.write('appdmg.json', dmgManifest);

    // Delete DMG file with this name if already exists
    releasesDir.remove(dmgName);

    console.log('Packaging to DMG file...');

    const readyDmgPath = releasesDir.path(dmgName);
    appdmg({
        source: tmpDir.path('appdmg.json'),
        target: readyDmgPath
    })
    .on('error', function (err) {
        console.error(err);
    })
    .on('finish', function () {
        console.log('DMG file ready!', readyDmgPath);
        deferred.resolve();
    });

    return deferred.promise;
};

const cleanClutter = function () {
    return tmpDir.removeAsync('.');
};

module.exports = function (params) {
    return init(params)
    .then(copyRuntime)
    .then(copyBuiltApp)
    .then(prepareOsSpecificThings)
    .then(signApp)
    .then(packToDmgFile)
    .then(cleanClutter);
};
