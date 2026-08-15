#!/usr/bin/env node
/**
 * Build (if needed), stop stale NW.js instances, and launch the desktop app.
 * Uses dist/index.html as the NW entry (same as production) unless --dev-server is passed.
 */
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const tmpDir = path.join(rootDir, 'tmp');

function clearTrayArtifactsOnDisk() {
    for (const artifact of [
      'tray-ready.json',
      'tray-command.json',
      'suppress-show.json',
      'main-window.json',
      'tray-debug.log',
    ]) {
    const artifactPath = path.join(tmpDir, artifact);
    if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);
  }
}

function resolveNwExe() {
  const nwModuleDir = path.join(rootDir, 'node_modules', 'nw');
  const symlink = path.join(nwModuleDir, 'nwjs');
  let runtimeDir = fs.existsSync(symlink) ? symlink : null;

  if (!runtimeDir) {
    const versioned = fs
      .readdirSync(nwModuleDir)
      .find((entry) => entry.startsWith('nwjs-v') && fs.statSync(path.join(nwModuleDir, entry)).isDirectory());
    if (versioned) runtimeDir = path.join(nwModuleDir, versioned);
  }

  if (!runtimeDir) {
    throw new Error('NW.js runtime not found. Run "npm install" first.');
  }

  const exeRel =
    process.platform === 'win32'
      ? 'nw.exe'
      : process.platform === 'darwin'
        ? path.join('nwjs.app', 'Contents', 'MacOS', 'nwjs')
        : 'nw';

  const exePath = path.join(runtimeDir, exeRel);
  if (!fs.existsSync(exePath)) {
    throw new Error(`NW.js binary not found at ${exePath}. Run "npm install" first.`);
  }

  return exePath;
}

function stopStaleNwInstances() {
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM nw.exe', { stdio: 'ignore' });
    } catch {
      // No running instances.
    }
    return;
  }

  if (process.platform === 'darwin') {
    try {
      execSync('pkill -f nwjs', { stdio: 'ignore' });
    } catch {
      // No running instances.
    }
    return;
  }

  try {
    execSync('pkill -f "nw ."', { stdio: 'ignore' });
  } catch {
    // No running instances.
  }
}

function ensureBuild() {
  const indexPath = path.join(rootDir, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) return;
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
}

function setPackageMain(entry) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const previousMain = pkg.main;
  if (pkg.main !== entry) {
    pkg.main = entry;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return previousMain;
}

function restorePackageMain(previousMain) {
  if (!previousMain) return;
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (pkg.main !== previousMain) {
    pkg.main = previousMain;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

const extraArgs = process.argv.slice(2);
const useDevServer = extraArgs.includes('--dev-server');
const nwArgs = extraArgs.filter((arg) => arg !== '--dev-server');

const hasUserDataDir = nwArgs.some((arg) => arg.startsWith('--user-data-dir'));
const launchArgs = hasUserDataDir
  ? nwArgs
  : [`--user-data-dir=${path.join(rootDir, 'tmp', 'user-data')}`, ...nwArgs];

const userDataArg = launchArgs.find((arg) => arg.startsWith('--user-data-dir='));
if (userDataArg) {
  const userDataDir = userDataArg.slice('--user-data-dir='.length);
  fs.mkdirSync(path.resolve(rootDir, userDataDir), { recursive: true });
}

stopStaleNwInstances();
clearTrayArtifactsOnDisk();
if (!useDevServer) ensureBuild();

const desiredMain = useDevServer ? 'main.cjs' : 'dist/index.html';
const previousMain = setPackageMain(desiredMain);

const cleanup = () => restorePackageMain(previousMain);

function shutdown(exitCode) {
  stopStaleNwInstances();
  cleanup();
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

const nwExe = resolveNwExe();
const args = ['.', '--onlykey-dev', ...launchArgs];

const child = spawn(nwExe, args, {
  cwd: rootDir,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('close', (code) => {
  stopStaleNwInstances();
  cleanup();
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  cleanup();
  console.error('Failed to launch NW.js:', error);
  process.exit(1);
});