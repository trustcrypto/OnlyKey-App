#!/usr/bin/env node
/**
 * Reproduces the user's tray flow headlessly and reports tmp/ + tray-ready state.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDesktopHarness } from './desktop-test-runner.mjs';
import { resolveNwExe } from './desktop-test-runner.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(rootDir, 'package.json');

function stopNw() {
  try {
    execSync('taskkill /F /IM nw.exe', { stdio: 'ignore' });
  } catch {
    // ignore
  }
}

function trayArtifacts() {
  const tmp = path.join(rootDir, 'tmp');
  const names = ['tray-ready.json', 'tray-command.json', 'suppress-show.json'];
  const out = {};
  for (const name of names) {
    const p = path.join(tmp, name);
    out[name] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').slice(0, 200) : null;
  }
  return out;
}

async function headlessStartFresh(label, userDataDir) {
  stopNw();
  const artifactsBefore = trayArtifacts();

  const testHtml = path.join(rootDir, 'tmp', `repro-${label}.html`);
  fs.writeFileSync(
    testHtml,
    `<!DOCTYPE html><html><body><script>
const fs=require('fs');const path=require('path');
const root=nw.App.startPath;
const out=path.join(root,'tmp',${JSON.stringify(`repro-${label}-result.json`)});
function ready(){
  try{
    if(!fs.existsSync(path.join(root,'tmp','tray-ready.json')))return false;
    const m=JSON.parse(fs.readFileSync(path.join(root,'tmp','tray-ready.json'),'utf8'));
    return m.ready&&m.hasQuitMenuItem;
  }catch(e){return false;}
}
require(path.join(root,'desktopBg.cjs')).start();
const t0=Date.now();
(function tick(){
  if(ready()||Date.now()-t0>15000){
    const desktop=require(path.join(root,'desktopBg.cjs'));
    fs.writeFileSync(out,JSON.stringify({ready:ready(),state:desktop.getTestState(),ms:Date.now()-t0},null,2));
    nw.App.quit();
    return;
  }
  setTimeout(tick,200);
})();
</script></body></html>`
  );

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const origMain = pkg.main;
  pkg.main = `tmp/repro-${label}.html`;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const resultPath = path.join(rootDir, 'tmp', `repro-${label}-result.json`);
  if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);

  const nwExe = resolveNwExe();
  await new Promise((resolve) => {
    spawn(
      nwExe,
      ['.', '--onlykey-dev', `--user-data-dir=${path.resolve(rootDir, userDataDir)}`],
      { cwd: rootDir, stdio: 'ignore', windowsHide: true }
    ).on('close', resolve);
  });

  pkg.main = origMain;
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  stopNw();

  let result = null;
  try {
    result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
  } catch {
    result = { error: 'no result' };
  }

  return { label, artifactsBefore, artifactsAfter: trayArtifacts(), result };
}

console.log('=== Step 1: fresh start (clean tray-ready) ===');
if (fs.existsSync(path.join(rootDir, 'tmp', 'tray-ready.json'))) {
  fs.unlinkSync(path.join(rootDir, 'tmp', 'tray-ready.json'));
}
console.log(JSON.stringify(await headlessStartFresh('step1', 'tmp/user-data-fresh'), null, 2));

console.log('\n=== Step 3: test:desktop (first harness only) ===');
await runDesktopHarness({
  entry: 'tests/desktop/desktop.harness.html',
  userDataDir: 'tmp/desktop-test-user-data-harness',
});
console.log('artifacts after test:', trayArtifacts());

console.log('\n=== Step 4: fresh start WITH stale tray-ready ===');
console.log(JSON.stringify(await headlessStartFresh('step4', 'tmp/user-data-fresh'), null, 2));