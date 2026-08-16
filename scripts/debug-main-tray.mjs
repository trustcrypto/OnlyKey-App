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

const testHtml = path.join(rootDir, 'tmp', 'main-tray-test.html');
fs.writeFileSync(
  testHtml,
  `<!DOCTYPE html><html><body><script>
const fs=require('fs');const path=require('path');
const root=nw.App.startPath;
const marker=path.join(root,'tmp','main-tray-result.json');
fs.mkdirSync(path.dirname(marker),{recursive:true});
const desktop=require(path.join(root,'desktopBg.cjs'));
desktop.startBackground();
setTimeout(function(){
  fs.writeFileSync(marker,JSON.stringify(desktop.getTestState(),null,2));
  nw.App.quit();
},3000);
</script></body></html>`
);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const origMain = pkg.main;
const origBg = pkg['bg-script'];

stopNw();
delete pkg['bg-script'];
pkg.main = 'tmp/main-tray-test.html';
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

const marker = path.join(rootDir, 'tmp', 'main-tray-result.json');
const trayReady = path.join(rootDir, 'tmp', 'tray-ready.json');
for (const f of [marker, trayReady]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const nwExe = resolveNwExe();
await new Promise((resolve) => {
  const child = spawn(
    nwExe,
    ['.', '--onlykey-desktop-test', `--user-data-dir=${path.join(rootDir, 'tmp', 'main-tray-test')}`],
    { cwd: rootDir, stdio: 'pipe', windowsHide: true }
  );
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  child.on('close', () => {
    const trayLines = stderr.split('\n').filter((l) => /tray|Tray|init/i.test(l));
    if (trayLines.length) console.log('stderr:', trayLines.join('\n'));
    resolve();
  });
});

console.log('state:', fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : 'MISSING');
console.log('tray-ready:', fs.existsSync(trayReady));

pkg.main = origMain;
if (origBg) pkg['bg-script'] = origBg;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
stopNw();