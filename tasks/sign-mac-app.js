#!/usr/bin/env node

const fs = require('fs');
const { exec } = require('./utils');

const APP = "tmp/OnlyKey App.app";
const IDENTITY = "Apple Development: Rodney Golpe (22GY3CKCH8)";
const frameworksDir = `${APP}/Contents/Versions/72.0.3626.121/nwjs Framework.framework`;

/****************************************************************************/

console.log("### finding things to sign");

const items = [];

let currentVersionDir;
for (const dir of fs.readdirSync(`${frameworksDir}/Versions`)) {
    if (fs.statSync(`${frameworksDir}/Versions/${dir}`).isDirectory) {
        currentVersionDir = `${frameworksDir}/Versions/${dir}`;
        break;
    }
}
if (!currentVersionDir) {
    console.error(`couldn't find "${frameworksDir}/Versions/[version]"`);
    process.exit(1);
}
for (const file of fs.readdirSync(`${currentVersionDir}`)) {
    if (file.endsWith('.dylib')) {
        items.push(`${currentVersionDir}/${file}`);
    }
}
for (const file of fs.readdirSync(`${currentVersionDir}/Helpers`)) {
    if (/^[a-z0-9_]*$/.test(file) || file.endsWith('.app')) {
        items.push(`${currentVersionDir}/Helpers/${file}`);
    }
}
for (const file of fs.readdirSync(`${currentVersionDir}/Libraries`)) {
    if (file.endsWith('.dylib')) {
        items.push(`${currentVersionDir}/Libraries/${file}`);
    }
}
for (const file of fs.readdirSync(`${currentVersionDir}/XPCServices`)) {
    if (file.endsWith('.xpc')) {
        items.push(`${currentVersionDir}/XPCServices/${file}`);
    }
}
items.push(frameworksDir);

/****************************************************************************/

console.log("");
console.log("### signing");

for (const item of items) {
    exec(`codesign --verbose --force --deep --strict --options runtime --timestamp --sign "${IDENTITY}" --entitlements neededToRun.entitlements "${item}"`);
}

exec(`codesign --verbose --force --deep --strict --options runtime --timestamp --sign "${IDENTITY}" --entitlements neededToRun.entitlements "${APP}"`);

/****************************************************************************/

console.log("");
console.log("### verifying signature");

exec(`codesign --verify -vvvv "${APP}"`);
