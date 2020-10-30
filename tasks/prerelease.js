"use strict";

const gulp = require("gulp");
const jetpack = require("fs-jetpack");
const { getNodeModulesDir } = require("./utils");

async function prerelease() {
  const projectDir = jetpack.cwd();
  const nodeModulesParent = getNodeModulesDir({ env: "production" }).split('/')[0];
  const manifest = jetpack.read("package.json", "json");
  manifest.name = "OK_TMP";
  jetpack
    .dir(nodeModulesParent, { empty: projectDir !== nodeModulesParent })
    .write('package.json', manifest);
}

gulp.task("prerelease", prerelease);
