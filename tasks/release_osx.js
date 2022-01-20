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

    projectDir.copy(`${node_modules_dir}/nw/nwjs/nwjs.app/Contents`,
        finalAppDir.path(),
        { matching: [ 'Versions'] });

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
    let info = projectDir.read('resources/osx/Info.plist');
    info = replace(info, {
        productName: manifest.productName,
        version: manifest.version
    });
    finalAppDir.write('Contents/Info.plist', info);

    // Icon
    projectDir.copy('resources/osx/icon.icns', finalAppDir.path('Contents/Resources/icon.icns'));

    // Rename executable, so it looks nice in the installer
    jetpack.rename(finalAppDir.path('Contents/MacOS/nwjs'), manifest.productName);

    return Q();
};

const packToDmgFile = function () {
    const deferred = Q.defer();

    const appdmg = require('appdmg');
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
    .then(packToDmgFile)
    .then(cleanClutter);
};
