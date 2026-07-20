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

const testHtml = path.join(rootDir, 'tmp', 'start-path-test.html');
fs.writeFileSync(
  testHtml,
  `<!DOCTYPE html><html><body><script>
const fs=require('fs');const path=require('path');
const root=nw.App.startPath;
const marker=path.join(root,'tmp','start-path-result.json');
require(path.join(root,'desktopBg.cjs')).start();
function ready(){
  try{
    if(!fs.existsSync(path.join(root,'tmp','tray-ready.json')))return false;
    const m=JSON.parse(fs.readFileSync(path.join(root,'tmp','tray-ready.json'),'utf8'));
    return m.ready&&m.hasQuitMenuItem;
  }catch(e){return false;}
}
const started=Date.now();
function tick(){
  if(ready()||Date.now()-started>12000){
    fs.writeFileSync(marker,JSON.stringify({ready:ready(),elapsed:Date.now()-started}));
    nw.App.quit();
    return;
  }
  setTimeout(tick,200);
}
setTimeout(tick,500);
</script></body></html>`
);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const origMain = pkg.main;
stopNw();
pkg.main = 'tmp/start-path-test.html';
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

const marker = path.join(rootDir, 'tmp', 'start-path-result.json');
if (fs.existsSync(marker)) fs.unlinkSync(marker);
if (fs.existsSync(path.join(rootDir, 'tmp', 'tray-ready.json'))) fs.unlinkSync(path.join(rootDir, 'tmp', 'tray-ready.json'));

const nwExe = resolveNwExe();
await new Promise((resolve) => {
  spawn(nwExe, ['.', '--onlykey-desktop-test', `--user-data-dir=${path.join(rootDir, 'tmp', 'start-path-test')}`], {
    cwd: rootDir, stdio: 'ignore', windowsHide: true,
  }).on('close', resolve);
});

console.log(fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : 'MISSING');
if (fs.existsSync(path.join(rootDir, 'tmp', 'tray-ready.json'))) {
  console.log('tray-ready:', fs.readFileSync(path.join(rootDir, 'tmp', 'tray-ready.json'), 'utf8'));
}

pkg.main = origMain;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
stopNw();