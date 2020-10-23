'use strict';

const gulp = require('gulp');
const utils = require('./utils');

const releaseTasks = {
    osx: require('./release_osx'),
    linux: require('./release_linux'),
    windows: require('./release_windows'),
};

gulp.task('release', gulp.series('build', function releaseForOs() {
    return releaseTasks[utils.os()]();
}));
