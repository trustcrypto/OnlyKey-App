#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNwExe } from './desktop-test-runner.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(rootDir, 'package.json');

function stopNw() {
  try { execSync('taskkill /F /IM nw.exe', { stdio: 'ignore' }); } catch {}
}

// Stale file from a "dead" previous run — no tray host should open if we skip on this.
fs.writeFileSync(
  path.join(rootDir, 'tmp', 'tray-ready.json'),
  JSON.stringify({ ready: true, ts: 1, hasQuitMenuItem: true, menuLabels: ['Show OnlyKey App'] })
);

const testHtml = path.join(rootDir, 'tmp', 'stale-repro.html');
fs.writeFileSync(
  testHtml,
  `<!DOCTYPE html><html><body><script>
const fs=require('fs');const path=require('path');
const root=nw.App.startPath;
const out=path.join(root,'tmp','stale-repro-result.json');
const desktop=require(path.join(root,'desktopBg.cjs'));
desktop.start();
setTimeout(function(){
  fs.writeFileSync(out,JSON.stringify({
    state:desktop.getTestState(),
    hostWindow:!!desktop._state.trayHostWindow,
    backgroundStarted:desktop._state.backgroundStarted,
    trayReadyFile:fs.existsSync(path.join(root,'tmp','tray-ready.json')),
  },null,2));
  nw.App.quit();
},3000);
</script></body></html>`
);

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const origMain = pkg.main;
pkg.main = 'tmp/stale-repro.html';
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

stopNw();
await new Promise((r) => {
  spawn(resolveNwExe(), ['.', '--onlykey-dev', `--user-data-dir=${path.join(rootDir, 'tmp/user-data-fresh')}`], {
    cwd: rootDir, stdio: 'ignore', windowsHide: true,
  }).on('close', r);
});

console.log(fs.readFileSync(path.join(rootDir, 'tmp', 'stale-repro-result.json'), 'utf8'));
pkg.main = origMain;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
stopNw();