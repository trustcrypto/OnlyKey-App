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

const nodeMainScript = path.join(rootDir, 'tmp', 'node-main-poll.cjs');
fs.writeFileSync(
  nodeMainScript,
  `'use strict';
const path = require('path');
const root = path.dirname(__filename).replace(/\\\\tmp$/, '');
require(path.join(root, 'desktopBg.cjs')).startCommandPollingOnly?.() 
  || require(path.join(root, 'desktopBg.cjs')).startBackground();
`
);

const testHtml = path.join(rootDir, 'tmp', 'node-main-show-test.html');
fs.writeFileSync(
  testHtml,
  `<!DOCTYPE html><html><body><script>
const fs=require('fs');const path=require('path');
const root=nw.App.startPath;
const marker=path.join(root,'tmp','node-main-show-result.json');
const desktop=require(path.join(root,'desktopBg.cjs'));
desktop.start();
const win=nw.Window.get();
win.hide();
setTimeout(function(){
  desktop.dispatchTrayCommand('show');
  setTimeout(function(){
    fs.writeFileSync(marker,JSON.stringify({visible:win.isVisible!==false,hiddenBefore:true}));
    nw.App.quit();
  },500);
},1000);
</script></body></html>`
);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const origMain = pkg.main;
const origBg = pkg['bg-script'];
const origNodeMain = pkg['node-main'];

stopNw();
delete pkg['bg-script'];
pkg.main = 'tmp/node-main-show-test.html';
pkg['node-main'] = 'tmp/node-main-poll.cjs';
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

const marker = path.join(rootDir, 'tmp', 'node-main-show-result.json');
if (fs.existsSync(marker)) fs.unlinkSync(marker);

const nwExe = resolveNwExe();
await new Promise((resolve) => {
  const child = spawn(
    nwExe,
    ['.', '--onlykey-desktop-test', `--user-data-dir=${path.join(rootDir, 'tmp', 'node-main-show')}`],
    { cwd: rootDir, stdio: 'ignore', windowsHide: true }
  );
  child.on('close', resolve);
});

console.log('result:', fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : 'MISSING');

pkg.main = origMain;
if (origBg) pkg['bg-script'] = origBg;
if (origNodeMain) pkg['node-main'] = origNodeMain;
else delete pkg['node-main'];
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
stopNw();