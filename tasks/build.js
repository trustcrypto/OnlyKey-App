'use strict';

var gulp = require('gulp');
var sourcemaps = require('gulp-sourcemaps');
var jetpack = require('fs-jetpack');

var utils = require('./utils');

var projectDir = jetpack;
var rootDir = projectDir.cwd('./');
var destDir = projectDir.cwd('./build');

const isChrome = utils.getEnvName() === 'chrome';

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
        'manifest.json',
        // 'node_modules/**/*',
    ],
};

if (isChrome) {
    const manifest = rootDir.read('manifest.json', 'json')
    paths.filesToCopyFromRootDir.push(
        'resources/onlykey_logo_*.png'
    );
}

// -------------------------------------
// Tasks
// -------------------------------------

gulp.task('clean', function(callback) {
    return destDir.dirAsync('.', { empty: true }).then(res => callback());
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

gulp.task('copy', copyTask);
gulp.task('copy-watch', copyTask);


var transpileTask = function () {
    return gulp.src(paths.jsCodeToTranspile, { base: 'app' })
        .pipe(sourcemaps.init())
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(destDir.path()));
};
gulp.task('transpile', transpileTask);
gulp.task('transpile-watch', transpileTask);


// Add and customize OS-specific and target-specific stuff.
gulp.task('finalize', function (done) {
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
    return done();
});


gulp.task('watch', function () {
    gulp.watch(paths.jsCodeToTranspile, transpileTask);
    gulp.watch(paths.filesToCopyFromRootDir, copyTask);
    gulp.watch(paths.filesToCopyFromAppDir, { cwd: 'app' }, copyTask);
});


gulp.task('build', gulp.series('clean', 'transpile', 'copy', 'finalize'));
