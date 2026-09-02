import { execSync, spawn } from 'node:child_process';
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

/**
 * Spawn NW.js. On Windows, retry UNKNOWN/EPERM after taskkill — the kernel
 * still holds nw.exe for a beat and ChildProcess.spawn throws synchronously.
 */
export function spawnNw(nwArgs, options = {}) {
  const nwExe = resolveNwExe();
  const opts = {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: false,
    ...options,
  };
  const attempts = process.platform === 'win32' ? 10 : 1;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return spawn(nwExe, nwArgs, opts);
    } catch (err) {
      lastErr = err;
      if (!isRetryableNwSpawnError(err) || i === attempts - 1) throw err;
      sleepMs(150);
    }
  }
  throw lastErr;
}

const NW_SPAWN_RETRY_CODES = new Set(['UNKNOWN', 'EPERM', 'EACCES', 'EBUSY']);

export function isRetryableNwSpawnError(err) {
  const code = err && typeof err === 'object' ? err.code : undefined;
  return typeof code === 'string' && NW_SPAWN_RETRY_CODES.has(code);
}

/** tasklist /NH line is `nw.exe` when a process exists, `INFO:` when none. */
export function tasklistShowsNw(output) {
  return /(?:^|[\r\n])nw\.exe\b/i.test(String(output));
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function winNwStillRunning() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq nw.exe" /NH', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return tasklistShowsNw(out);
  } catch {
    return false;
  }
}

export function stopStaleNwInstances() {
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM nw.exe /T', { stdio: 'ignore', windowsHide: true });
    } catch {
      // No running instances.
    }
    // Windows keeps nw.exe mapped briefly after taskkill; spawn then throws UNKNOWN.
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && winNwStillRunning()) {
      sleepMs(100);
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
