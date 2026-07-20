#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(rootDir, 'package.json');

function resolveNwExe() {
  const nwModuleDir = path.join(rootDir, 'node_modules', 'nw');
  const runtimeDir = fs.readdirSync(nwModuleDir).find((e) => e.startsWith('nwjs'));
  return path.join(nwModuleDir, runtimeDir, 'nw.exe');
}

function stopNw() {
  try {
    execSync('taskkill /F /IM nw.exe', { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

const nodeMainScript = path.join(rootDir, 'desktopNodeMain.cjs');
fs.writeFileSync(
  nodeMainScript,
  `'use strict';
const fs = require('fs');
const path = require('path');
const root = path.dirname(__filename);
const marker = path.join(root, 'tmp', 'node-main-ran.json');
fs.mkdirSync(path.dirname(marker), { recursive: true });
try {
  if (typeof nw !== 'undefined') {
    const desktop = require(path.join(root, 'desktopBg.cjs'));
    desktop.startBackground();
    setTimeout(function () {
      const state = desktop.getTestState();
      fs.writeFileSync(marker, JSON.stringify({ ts: Date.now(), state }));
    }, 3000);
  } else {
    fs.writeFileSync(marker, JSON.stringify({ ts: Date.now(), error: 'no nw' }));
  }
} catch (e) {
  fs.writeFileSync(marker, JSON.stringify({ ts: Date.now(), error: String(e) }));
}
`
);

const testHtml = path.join(rootDir, 'tmp', 'bg-test.html');
fs.writeFileSync(
  testHtml,
  `<!DOCTYPE html><html><body><script>
setTimeout(function(){ nw.App.quit(); }, 6000);
</script></body></html>`
);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const origMain = pkg.main;
const origBg = pkg['bg-script'];
const origNodeMain = pkg['node-main'];

stopNw();
delete pkg['bg-script'];
pkg.main = 'tmp/bg-test.html';
pkg['node-main'] = 'desktopNodeMain.cjs';
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

const marker = path.join(rootDir, 'tmp', 'node-main-ran.json');
const trayReady = path.join(rootDir, 'tmp', 'tray-ready.json');
if (fs.existsSync(marker)) fs.unlinkSync(marker);
if (fs.existsSync(trayReady)) fs.unlinkSync(trayReady);

const iconPath = path.join(rootDir, 'resources', 'ok-tray-logo.png');
console.log('icon exists:', fs.existsSync(iconPath), iconPath);

const nwExe = resolveNwExe();
await new Promise((resolve) => {
  const child = spawn(
    nwExe,
    ['.', '--onlykey-desktop-test', `--user-data-dir=${path.join(rootDir, 'tmp', 'node-main-test')}`],
    { cwd: rootDir, stdio: 'pipe', windowsHide: true }
  );
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  child.on('close', () => {
    if (stderr) console.log('stderr:', stderr.slice(0, 2000));
    resolve();
  });
});

let markerResult = null;
try {
  markerResult = JSON.parse(fs.readFileSync(marker, 'utf8'));
} catch {
  markerResult = 'missing';
}

console.log('node-main result:', JSON.stringify(markerResult, null, 2));
console.log('tray-ready.json:', fs.existsSync(trayReady));

pkg.main = origMain;
if (origBg) pkg['bg-script'] = origBg;
else delete pkg['bg-script'];
if (origNodeMain) pkg['node-main'] = origNodeMain;
else delete pkg['node-main'];
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
stopNw();