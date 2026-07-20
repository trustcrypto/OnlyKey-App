#!/usr/bin/env node
/**
 * Minimal NW tray menu smoke test. Writes tmp/tray-menu-smoke.json on success.
 * Run after npm install: node scripts/tray-menu-smoke.mjs
 */
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

const smokeHtml = path.join(rootDir, 'tmp', 'tray-menu-smoke.html');
fs.mkdirSync(path.dirname(smokeHtml), { recursive: true });
fs.writeFileSync(
  smokeHtml,
  `<!DOCTYPE html><html><body><script>
var fs=require('fs');var path=require('path');
var out=path.join(nw.App.startPath,'tmp','tray-menu-smoke.json');
var menu=new nw.Menu();
var item=new nw.MenuItem({
  label:'Smoke Test Click',
  click:function(){
    fs.writeFileSync(out,JSON.stringify({clicked:true,ts:Date.now()},null,2));
    nw.App.quit();
  }
});
menu.append(item);
var tray=new nw.Tray({icon:path.join(nw.App.startPath,'resources','ok-tray-logo.png').replace(/\\\\/g,'/')});
tray.menu=menu;
setTimeout(function(){
  item.click();
},1500);
setTimeout(function(){nw.App.quit();},5000);
</script></body></html>`
);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const origMain = pkg.main;
pkg.main = 'tmp/tray-menu-smoke.html';
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

const resultPath = path.join(rootDir, 'tmp', 'tray-menu-smoke.json');
if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);

stopNw();
const nwExe = resolveNwExe();
await new Promise((resolve) => {
  spawn(nwExe, ['.', `--user-data-dir=${path.join(rootDir, 'tmp', 'tray-menu-smoke')}`], {
    cwd: rootDir,
    stdio: 'ignore',
    windowsHide: true,
  }).on('close', resolve);
});

pkg.main = origMain;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
stopNw();

const ok = fs.existsSync(resultPath);
console.log(ok ? fs.readFileSync(resultPath, 'utf8') : 'FAIL: MenuItem.click did not run');
process.exit(ok ? 0 : 1);