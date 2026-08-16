#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNwExe } from './nw-runtime.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(rootDir, 'package.json');

function stopNw() {
  try {
    execSync('taskkill /F /IM nw.exe', { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

const testHtml = path.join(rootDir, 'tmp', 'offscreen-test.html');
fs.writeFileSync(
  testHtml,
  `<!DOCTYPE html><html><body><script>
const fs=require('fs');const path=require('path');
const root=nw.App.startPath;
const marker=path.join(root,'tmp','offscreen-result.json');
nw.Window.open('desktopBg.html',{
  show:true,frame:false,width:1,height:1,position:'mouse',show_in_taskbar:false,resizable:false
},function(){
  setTimeout(function(){
    fs.writeFileSync(marker,JSON.stringify({
      trayReady:fs.existsSync(path.join(root,'tmp','tray-ready.json')),
    },null,2));
    nw.App.quit();
  },5000);
});
</script></body></html>`
);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const origMain = pkg.main;
const origBg = pkg['bg-script'];

stopNw();
delete pkg['bg-script'];
pkg.main = 'tmp/offscreen-test.html';
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

const marker = path.join(rootDir, 'tmp', 'offscreen-result.json');
const trayReady = path.join(rootDir, 'tmp', 'tray-ready.json');
for (const f of [marker, trayReady]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const nwExe = resolveNwExe();
await new Promise((resolve) => {
  const child = spawn(
    nwExe,
    ['.', '--onlykey-desktop-test', `--user-data-dir=${path.join(rootDir, 'tmp', 'offscreen-test')}`],
    { cwd: rootDir, stdio: 'ignore', windowsHide: true }
  );
  child.on('close', resolve);
});

console.log('result:', fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : 'MISSING');

pkg.main = origMain;
if (origBg) pkg['bg-script'] = origBg;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
stopNw();