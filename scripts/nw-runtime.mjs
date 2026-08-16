import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const tmpDir = path.join(rootDir, 'tmp');

const TRAY_ARTIFACTS = [
  'tray-ready.json',
  'tray-command.json',
  'suppress-show.json',
  'main-window.json',
  'tray-debug.log',
];

export function resolveNwjsDir() {
  const nwModuleDir = path.join(rootDir, 'node_modules', 'nw');
  const symlink = path.join(nwModuleDir, 'nwjs');
  if (fs.existsSync(symlink)) return symlink;

  const versioned = fs
    .readdirSync(nwModuleDir)
    .find((entry) => entry.startsWith('nwjs-v') && fs.statSync(path.join(nwModuleDir, entry)).isDirectory());
  if (versioned) return path.join(nwModuleDir, versioned);

  throw new Error('NW.js runtime not found. Run "npm install" first.');
}

export function resolveNwExe() {
  const exeRel =
    process.platform === 'win32'
      ? 'nw.exe'
      : process.platform === 'darwin'
        ? path.join('nwjs.app', 'Contents', 'MacOS', 'nwjs')
        : 'nw';

  const exePath = path.join(resolveNwjsDir(), exeRel);
  if (!fs.existsSync(exePath)) {
    throw new Error(`NW.js binary not found at ${exePath}. Run "npm install" first.`);
  }

  return exePath;
}

export function stopStaleNwInstances() {
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

export function setPackageMain(entry) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const previousMain = pkg.main;
  if (pkg.main !== entry) {
    pkg.main = entry;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return previousMain;
}

export function restorePackageMain(previousMain) {
  if (!previousMain) return;
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (pkg.main !== previousMain) {
    pkg.main = previousMain;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

export function clearTrayArtifactsOnDisk() {
  for (const artifact of TRAY_ARTIFACTS) {
    const artifactPath = path.join(tmpDir, artifact);
    if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);
  }
}
