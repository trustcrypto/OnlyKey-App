"use strict";

const gulp = require("gulp");
const projectDir = require("fs-jetpack");
const { getNodeModulesDir, os } = require("./utils");

const manifest = projectDir.read("package.json", "json");

async function prerelease() {
  manifest.name = "OK_TMP";
  projectDir.dir(getNodeModulesDir({ env: "production" }), { empty: true });
  projectDir.write(
    `${getNodeModulesDir({ env: "production" })}\package.json`,
    manifest
  );
}

gulp.task("prerelease", prerelease);
