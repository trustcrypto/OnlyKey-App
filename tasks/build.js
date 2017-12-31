'use strict';

var gulp = require('gulp');
var sourcemaps = require('gulp-sourcemaps');
var less = require('gulp-less');
var jetpack = require('fs-jetpack');

var utils = require('./utils');

var projectDir = jetpack;
var rootDir = projectDir.cwd('./');
var destDir = projectDir.cwd('./build');

var paths = {
    jsCodeToTranspile: [
        'app/scripts/**/*.js',
        'app/*.js',
    ],
    filesToCopyFromAppDir: [
        'images/**/*',
        'stylesheets/**/*',
        'vendor/**/*',
        '*.html',
    ],
    filesToCopyFromRootDir: [
        'manifest.json'
    ],
};

if (utils.getEnvName() === 'chrome') {
    paths.filesToCopyFromRootDir.push(
        'resources/onlykey_logo_*.png'
    );
}

// -------------------------------------
// Tasks
// -------------------------------------

gulp.task('clean', function(callback) {
    return destDir.dirAsync('.', { empty: true });
});


var copyTask = function () {
    projectDir.copy('resources/onlykey_logo_128.png', destDir.path('icon.png'), { overwrite: true });

    if (utils.getEnvName() === 'production') {
        projectDir.copy('node_modules', destDir.path('node_modules'), {
            matching: [ '!nw/**/*' ],
            overwrite: true
        });
    }

    var result = jetpack.copyAsync(projectDir.path('app'), destDir.path(), {
        overwrite: true,
        matching: paths.filesToCopyFromAppDir
    });
    result = result.then(() => {
        return jetpack.copyAsync(projectDir.path(), destDir.path(), {
            overwrite: true,
            matching: paths.filesToCopyFromRootDir
        });
    });
    return result;
};
gulp.task('copy', ['clean'], copyTask);
gulp.task('copy-watch', copyTask);


var transpileTask = function () {
    return gulp.src(paths.jsCodeToTranspile, { base: 'app' })
    .pipe(sourcemaps.init())
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest(destDir.path()));
};
gulp.task('transpile', ['clean'], transpileTask);
gulp.task('transpile-watch', transpileTask);


// Add and customize OS-specific and target-specific stuff.
gulp.task('finalize', ['clean'], function () {
    var manifest = rootDir.read('package.json', 'json');
    switch (utils.getEnvName()) {
        case 'production':
            // Hide dev toolbar if doing a release.
            manifest.window.toolbar = false;
            break;
        case 'test':
            // Add "-test" suffix to name, so NW.js will write all
            // data like cookies and locaStorage into separate place.
            manifest.name += '-test';
            // TODO: Change manifest.main to launch a test runner?
            break;
        case 'development':
            // Add "-dev" suffix to name, so NW.js will write all
            // data like cookies and locaStorage into separate place.
            manifest.name += '-dev';
            break;
    }
    destDir.write('package.json', manifest);

    var configFilePath = projectDir.path('config/env_' + utils.getEnvName() + '.json');
    destDir.copy(configFilePath, 'env_config.json');
});


gulp.task('watch', function () {
    gulp.watch(paths.jsCodeToTranspile, ['transpile-watch']);
    gulp.watch(paths.filesToCopyFromRootDir, ['copy-watch']);
    gulp.watch(paths.filesToCopyFromAppDir, { cwd: 'app' }, ['copy-watch']);
});


gulp.task('build', ['transpile', 'copy', 'finalize']);
