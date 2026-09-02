#!/usr/bin/env node
/**
 * Build (if needed), stop stale NW.js instances, and launch the desktop app.
 * Uses dist/index.html as the NW entry (same as production) unless --dev-server is passed.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  rootDir,
  stopStaleNwInstances,
  setPackageMain,
  restorePackageMain,
  clearTrayArtifactsOnDisk,
  spawnNw,
} from './nw-runtime.mjs';

function ensureBuild() {
  const indexPath = path.join(rootDir, 'dist', 'index.html');
  if (fs.existsSync(indexPath)) return;
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
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

const args = ['.', '--onlykey-dev', ...launchArgs];

let child;
try {
  child = spawnNw(args, {
    cwd: rootDir,
    stdio: 'inherit',
    windowsHide: false,
  });
} catch (error) {
  cleanup();
  console.error('Failed to launch NW.js:', error);
  process.exit(1);
}

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
