'use strict';

var Q = require('q');
var childProcess = require('child_process');
var jetpack = require('fs-jetpack');
var utils = require('./utils');

var projectDir;
var releasesDir;
var packName;
var packDir;
var tmpDir;
var readyAppDir;
var manifest;
var node_modules_dir;

var init = function (params={}) {
    projectDir = params.projectDir || jetpack;
    tmpDir = params.tmpDir || projectDir.dir('./tmp', { empty: true });
    releasesDir = params.releasesDir || projectDir.dir('./releases');
    manifest = params.manifest || projectDir.read('package.json', 'json');
    node_modules_dir = params.node_modules_dir || 'node_modules';

    packName = manifest.name + '_' + manifest.version;
    packDir = tmpDir.dir(packName);
    readyAppDir = packDir.cwd('opt', manifest.name);
    return Q();
};

var copyRuntime = function () {
    // this pulls all files and directories from node_modules/nw/nwjs
    // and copies them into /opt/OnlyKey
    return projectDir.copyAsync(`${node_modules_dir}/nw/nwjs`, readyAppDir.path(), { overwrite: true });
};

var copyBuiltApp = function () {
    return projectDir.copyAsync('build', readyAppDir.path(), { overwrite: true });
};

var prepareOsSpecificThings = function () {
    // Create .desktop file from the template
    var desktop = projectDir.read('resources/linux/app.desktop');
    desktop = utils.replace(desktop, {
        name: manifest.name,
        productName: manifest.productName,
        description: manifest.description,
        version: manifest.version,
        author: manifest.author
    });
    packDir.write('usr/share/applications/' + manifest.name + '.desktop', desktop);

    var udevRules = projectDir.read('resources/linux/49-onlykey.rules');
    packDir.write('etc/udev/rules.d/49-onlykey.rules' , udevRules);

    var postinst = projectDir.read('resources/linux/postinst');
    // mode >=0755 и <=0775
    packDir.write('DEBIAN/postinst' , postinst, {mode: '755'});

    return Q();
};

var updateRuntimeFileMode = function () {
    var deferred = Q.defer();

    console.log('chmodding nwjs runtime...');

    childProcess.exec('chmod -R 755 ' + readyAppDir.path(),
        function (error, stdout, stderr) {
            if (error || stderr) {
                console.log("ERROR while chmodding nwjs runtime:");
                console.log(error);
                console.log(stderr);
            }
            deferred.resolve();
        });

    return deferred.promise;
};

var packToDebFile = function () {
    var deferred = Q.defer();

    var debFileName = packName + '_amd64.deb';
    var debPath = releasesDir.path(debFileName);

    console.log('Creating DEB package...');

    // Counting size of the app in KiB
    var appSize = Math.round(readyAppDir.inspectTree('.').size / 1024);

    // Preparing debian control file
    var control = projectDir.read('resources/linux/DEBIAN/control');
    control = utils.replace(control, {
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        author: manifest.author,
        size: appSize
    });
    packDir.write('DEBIAN/control', control);

    // Build the package...
    childProcess.exec('fakeroot dpkg-deb -Zxz --build ' + packDir.path() + ' ' + debPath,
        function (error, stdout, stderr) {
            if (error || stderr) {
                console.log("ERROR while building DEB package:");
                console.log(error);
                console.log(stderr);
            } else {
                console.log('DEB package ready!', debPath);
            }
            deferred.resolve();
        });

    return deferred.promise;
};

var cleanClutter = function () {
    return tmpDir.removeAsync('.');
};

module.exports = function (params) {
    return init(params)
    .then(copyRuntime)
    .then(updateRuntimeFileMode)
    .then(copyBuiltApp)
    .then(prepareOsSpecificThings)
    .then(packToDebFile)
    .then(cleanClutter);
};
