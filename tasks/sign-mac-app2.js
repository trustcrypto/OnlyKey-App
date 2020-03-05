#!/usr/bin/env node

const fs = require('fs');
const { exec } = require('./utils');

const APP = 'tmp/OnlyKey App.app';
const IDENTITY = 'Apple Development: Rodney Golpe (22GY3CKCH8)';

const symlinkPath = `${APP}/Contents/Resources/app.nw/node_modules/.bin/nw`

const fwVersion = '72.0.3626.121';
const frameworksDir = `${APP}/Contents/Versions/${fwVersion}`;
const helperAppToSign = `${frameworksDir}/nwjs Helper.app`;

/****************************************************************************/

console.log('✅ remove nw symlink');
try {
    const sl = fs.lstatSync(symlinkPath);
    // sl && sl.isSymbolicLink() && exec(`rm "${APP}/Contents/Resources/app.nw/node_modules/.bin/nw"`);
} catch (err) {
    console.log(`symlink did not exist: ${err}`);
}

/*******
 * Trying several variations of codesign.
 * 
 * Cannot run app with "--options runtime". Cannot notarize without it. Same issue as:
 * https://github.com/nwjs/nw.js/issues/7117#issuecomment-593277949
 * 
 * 
 */

console.log('✅ sign helper app');
// exec(`codesign --verbose --force --deep --strict --options runtime --timestamp --sign "${IDENTITY}" --entitlements neededToRun.entitlements "${helperAppToSign}"`);
// exec(`codesign --verbose --force --deep --strict --timestamp --sign "${IDENTITY}" --entitlements neededToRun.entitlements "${helperAppToSign}"`);
// exec(`codesign --verbose --force --deep --strict --options runtime --timestamp --sign "${IDENTITY}" "${helperAppToSign}"`);
exec(`codesign --force --deep --verbose --sign "${IDENTITY}" "${helperAppToSign}"`);

console.log('✅ sign app');
// exec(`codesign --verbose --force --deep --strict --options runtime --timestamp --sign "${IDENTITY}" --entitlements neededToRun.entitlements "${APP}"`);
// exec(`codesign --verbose --force --deep --strict --timestamp --sign "${IDENTITY}" --entitlements neededToRun.entitlements "${APP}"`);
// exec(`codesign --verbose --force --deep --strict --options runtime --timestamp --sign "${IDENTITY}" "${APP}"`);
exec(`codesign --force --deep --verbose --sign "${IDENTITY}" "${APP}"`);

console.log('✅ verifying signature');
exec(`codesign --verify -vvvv "${APP}"`);
exec(`spctl -a -vvvv "${APP}"`);
