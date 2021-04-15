"use strict";

const gulp = require("gulp");
const sourcemaps = require("gulp-sourcemaps");
const jetpack = require("fs-jetpack");

const { getEnvName, getNodeModulesDir } = require("./utils");
const isChrome = getEnvName() === "chrome";

const projectDir = jetpack;
const rootDir = projectDir.cwd("./");
const destDir = projectDir.cwd("./build");

let manifest = rootDir.read("package.json", "json");

const paths = {
  jsCodeToTranspile: ["app/scripts/**/*.js", "app/*.js"],
  filesToCopyFromAppDir: [
    "images/**/*",
    "stylesheets/**/*",
    "vendor/**/*",
    "*.html",
  ],
  filesToCopyFromRootDir: [
    "manifest.json",
    "!release_node_modules/**/*",
    "!releases/**/*",
  ],
};

if (isChrome) {
  manifest = rootDir.read("manifest.json", "json");
  paths.filesToCopyFromRootDir.push("resources/onlykey_logo_*.png");
  console.log(`Copying resources/onlykey_logo_*.png for Chrome extension...`);
}

// -------------------------------------
// Tasks
// -------------------------------------

gulp.task("clean", function (callback) {
  return destDir.dirAsync(".", { empty: true }).then((res) => callback());
});

var copyTask = function () {
  projectDir.copy("resources/onlykey_logo_128.png", destDir.path("icon.png"), {
    overwrite: true,
  });

  if (getEnvName() === "production") {
    console.log(`Copying node_modules from ${getNodeModulesDir()}...`);
    rootDir.copy(`${getNodeModulesDir()}`, destDir.path("node_modules"), {
      matching: ["!nw/**/*"],
      overwrite: true,
    });
  }

  var result = jetpack.copyAsync(projectDir.path("app"), destDir.path(), {
    overwrite: true,
    matching: paths.filesToCopyFromAppDir,
  });
  result = result.then(() => {
    return jetpack.copyAsync(projectDir.path(), destDir.path(), {
      overwrite: true,
      matching: paths.filesToCopyFromRootDir,
    });
  });
  return result;
};

gulp.task("copy", copyTask);
gulp.task("copy-watch", copyTask);

var transpileTask = function () {
  return gulp
    .src(paths.jsCodeToTranspile, { base: "app" })
    .pipe(sourcemaps.init())
    .pipe(sourcemaps.write("."))
    .pipe(gulp.dest(destDir.path()));
};
gulp.task("transpile", transpileTask);
gulp.task("transpile-watch", transpileTask);

// Add and customize OS-specific and target-specific stuff.
gulp.task("finalize", function (done) {
  switch (getEnvName()) {
    case "production":
      // Hide dev toolbar if doing a release.
      manifest.window.toolbar = false;
      break;
    case "test":
      // Add "-test" suffix to name, so NW.js will write all
      // data like cookies and locaStorage into separate place.
      manifest.name += "-test";
      // TODO: Change manifest.main to launch a test runner?
      break;
    case "development":
      // Add "-dev" suffix to name, so NW.js will write all
      // data like cookies and locaStorage into separate place.
      manifest.name += "-dev";
      break;
  }
  destDir.write("package.json", manifest);
  return done();
});

gulp.task("watch", function () {
  gulp.watch(paths.jsCodeToTranspile, transpileTask);
  gulp.watch(paths.filesToCopyFromRootDir, copyTask);
  gulp.watch(paths.filesToCopyFromAppDir, { cwd: "app" }, copyTask);
});

gulp.task("build", gulp.series("clean", "transpile", "copy", "finalize"));
