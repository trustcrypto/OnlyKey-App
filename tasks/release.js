'use strict';

const gulp = require('gulp');
const projectDir = require('fs-jetpack');
const { getNodeModulesDir, os } = require('./utils');

const tmpDir = projectDir.dir('./tmp', { empty: true });
const releasesDir = projectDir.dir('./releases');
const manifest = projectDir.read('package.json', 'json');
const node_modules_dir = getNodeModulesDir();

const releaseTasks = {
    osx: require('./release_osx'),
    linux: require('./release_linux'),
    windows: require('./release_windows'),
};

gulp.task('release', gulp.series(function releaseForOs() {
    return releaseTasks[os()]({
        manifest,
        node_modules_dir,
        projectDir,
        releasesDir,
        tmpDir
    });
}));
