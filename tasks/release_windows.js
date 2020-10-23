'use strict';

var Q = require('q');
var childProcess = require('child_process');
var jetpack = require('fs-jetpack');
var utils = require('./utils');

var projectDir;
var tmpDir;
var releasesDir;
var readyAppDir;
var manifest;
var node_modules_dir;

var init = function (params={}) {
    projectDir = params.projectDir || jetpack;
    tmpDir = params.tmpDir || projectDir.dir('./tmp', { empty: true });
    releasesDir = params.releasesDir || projectDir.dir('./releases');
    manifest = params.manifest || projectDir.read('package.json', 'json');
    node_modules_dir = node_modules_dir || 'node_modules';

    readyAppDir = tmpDir.cwd(manifest.name);
    return Q();
};

var copyRuntime = function () {
    return projectDir.copyAsync(`${node_modules_dir}/nw/nwjs`, readyAppDir.path(), { overwrite: true });
};

var copyBuiltApp = function () {
    return projectDir.copyAsync('build', readyAppDir.path(), { overwrite: true });
};

var prepareOsSpecificThings = function () {
    return projectDir.copyAsync('resources/windows/icon.ico', readyAppDir.path('icon.ico'));
};

var createInstaller = function () {
    var deferred = Q.defer();

    var finalPackageName = manifest.name + '_' + manifest.version + '.exe';
    var installScript = projectDir.read('resources/windows/installer.nsi');
    installScript = utils.replace(installScript, {
        name: manifest.name,
        productName: manifest.productName,
        version: manifest.version,
        src: readyAppDir.path(),
        dest: releasesDir.path(finalPackageName),
        icon: readyAppDir.path('icon.ico'),
        setupIcon: projectDir.path('resources/windows/setup-icon.ico'),
        banner: projectDir.path('resources/windows/setup-banner.bmp'),
    });
    tmpDir.write('installer.nsi', installScript);

    console.log('Building installer with NSIS...');

    // Remove destination file if already exists.
    releasesDir.remove(finalPackageName);

    // Note: NSIS have to be added to PATH (environment variables).
    var nsis = childProcess.spawn('makensis', [tmpDir.path('installer.nsi')]);
    nsis.stdout.pipe(process.stdout);
    nsis.stderr.pipe(process.stderr);
    nsis.on('close', function () {
        console.log('Installer ready!', releasesDir.path(finalPackageName));
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
    .then(copyBuiltApp)
    .then(prepareOsSpecificThings)
    .then(createInstaller)
    .then(cleanClutter);
};
