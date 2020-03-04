'use strict';

const gulp = require('gulp');
const utils = require('./utils');

const releaseForOs = {
    osx: require('./release_osx'),
    linux: require('./release_linux'),
    windows: require('./release_windows'),
};

gulp.task('release', gulp.series('build', function () {
    return releaseForOs[utils.os()](utils.args);
}));
