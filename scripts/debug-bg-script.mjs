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

async function runCase(label, pkgOverrides, waitMs = 6000) {
  stopNw();
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const saved = { main: pkg.main, 'bg-script': pkg['bg-script'], 'node-main': pkg['node-main'] };
  Object.assign(pkg, pkgOverrides);
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const trayReady = path.join(rootDir, 'tmp', 'tray-ready.json');
  if (fs.existsSync(trayReady)) fs.unlinkSync(trayReady);

  const nwExe = resolveNwExe();
  await new Promise((resolve) => {
    const child = spawn(
      nwExe,
      ['.', '--onlykey-desktop-test', `--user-data-dir=${path.join(rootDir, 'tmp', 'bg-case-' + label)}`],
      { cwd: rootDir, stdio: 'ignore', windowsHide: true }
    );
    setTimeout(() => {
      try { child.kill('SIGTERM'); } catch {}
      resolve();
    }, waitMs);
  });

  const ready = fs.existsSync(trayReady);
  console.log(`${label}: tray-ready=${ready} main=${pkg.main} bg-script=${pkg['bg-script']}`);

  pkg.main = saved.main;
  if (saved['bg-script']) pkg['bg-script'] = saved['bg-script'];
  else delete pkg['bg-script'];
  if (saved['node-main']) pkg['node-main'] = saved['node-main'];
  else delete pkg['node-main'];
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

// Minimal main that quits after delay
const minimalMain = path.join(rootDir, 'tmp', 'minimal-main.html');
fs.writeFileSync(minimalMain, `<!DOCTYPE html><html><body><script>setTimeout(()=>nw.App.quit(),5000)</script></body></html>`);

await runCase('html-bg', { main: 'tmp/minimal-main.html', 'bg-script': 'desktopBg.html' });
await runCase('cjs-bg', { main: 'tmp/minimal-main.html', 'bg-script': 'desktopBgScript.cjs' });
await runCase('dist-main', { main: 'dist/index.html', 'bg-script': 'desktopBg.html' });
stopNw();