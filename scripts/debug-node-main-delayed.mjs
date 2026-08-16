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

const testHtml = path.join(rootDir, 'tmp', 'minimal-main.html');
fs.writeFileSync(testHtml, `<!DOCTYPE html><html><body><script>setTimeout(()=>nw.App.quit(),8000)</script></body></html>`);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const origMain = pkg.main;
const origBg = pkg['bg-script'];
const origNodeMain = pkg['node-main'];

stopNw();
delete pkg['bg-script'];
pkg.main = 'tmp/minimal-main.html';
pkg['node-main'] = 'desktopNodeMain.cjs';
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

const marker = path.join(rootDir, 'tmp', 'node-main-ran.json');
const trayReady = path.join(rootDir, 'tmp', 'tray-ready.json');
for (const f of [marker, trayReady]) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const nwExe = resolveNwExe();
await new Promise((resolve) => {
  const child = spawn(
    nwExe,
    ['.', '--onlykey-desktop-test', `--user-data-dir=${path.join(rootDir, 'tmp', 'node-main-root')}`],
    { cwd: rootDir, stdio: 'ignore', windowsHide: true }
  );
  child.on('close', resolve);
});

console.log('node-main:', fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : 'MISSING');
console.log('tray-ready:', fs.existsSync(trayReady));

pkg.main = origMain;
if (origBg) pkg['bg-script'] = origBg;
if (origNodeMain) pkg['node-main'] = origNodeMain;
else delete pkg['node-main'];
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
stopNw();