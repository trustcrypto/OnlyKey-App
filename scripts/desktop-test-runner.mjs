#!/usr/bin/env node
/**
 * Launches NW.js against a desktop test harness and returns structured results.
 * Used by vitest desktop integration tests and `npm run test:desktop`.
 */
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const resultPath = path.join(rootDir, 'tmp', 'desktop-test-result.json');
const harnessEntry = 'tests/desktop/desktop.harness.html';

export function resolveNwExe() {
  const nwModuleDir = path.join(rootDir, 'node_modules', 'nw');
  const runtimeDir = fs
    .readdirSync(nwModuleDir)
    .find((entry) => entry.startsWith('nwjs'));

  if (!runtimeDir) {
    throw new Error('NW.js runtime not found. Run "npm install" first.');
  }

  const exeName =
    process.platform === 'win32' ? 'nw.exe' : process.platform === 'darwin' ? 'nwjs' : 'nw';

  return path.join(nwModuleDir, runtimeDir, exeName);
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

function readPackageJson() {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
}

function writePackageJson(pkg) {
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function setPackageMain(entry) {
  const pkg = readPackageJson();
  const previousMain = pkg.main;
  if (pkg.main !== entry) {
    pkg.main = entry;
    writePackageJson(pkg);
  }
  return previousMain;
}

function restorePackageMain(previousMain) {
  if (!previousMain) return;
  const pkg = readPackageJson();
  if (pkg.main !== previousMain) {
    pkg.main = previousMain;
    writePackageJson(pkg);
  }
}

function setPackageInjectJsEnd(injectJsEnd) {
  const pkg = readPackageJson();
  pkg.window = pkg.window || {};
  const previous = pkg.window.inject_js_end ?? null;
  if (injectJsEnd) {
    pkg.window.inject_js_end = injectJsEnd;
  } else {
    delete pkg.window.inject_js_end;
  }
  writePackageJson(pkg);
  return previous;
}

function restorePackageInjectJsEnd(previousInjectJsEnd) {
  const pkg = readPackageJson();
  pkg.window = pkg.window || {};
  if (previousInjectJsEnd) {
    pkg.window.inject_js_end = previousInjectJsEnd;
  } else {
    delete pkg.window.inject_js_end;
  }
  writePackageJson(pkg);
}

function waitForResult(timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (fs.existsSync(resultPath)) {
        try {
          resolve(JSON.parse(fs.readFileSync(resultPath, 'utf8')));
          return;
        } catch (error) {
          reject(error);
          return;
        }
      }

      if (Date.now() - started >= timeoutMs) {
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${resultPath}`));
        return;
      }

      setTimeout(tick, 200);
    };
    tick();
  });
}

/**
 * @param {{ timeoutMs?: number, userDataDir?: string, entry?: string, injectJsEnd?: string }} [options]
 */
export async function runDesktopHarness(options = {}) {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const entry = options.entry ?? harnessEntry;
  const userDataDir = path.resolve(
    rootDir,
    options.userDataDir ?? path.join('tmp', 'desktop-test-user-data')
  );

  stopStaleNwInstances();
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  if (fs.existsSync(resultPath)) fs.rmSync(resultPath);

  const tmpDir = path.join(rootDir, 'tmp');
  for (const artifact of [
    'suppress-show.json',
    'tray-command.json',
    'tray-ready.json',
    'main-window.json',
    'tray-debug.log',
  ]) {
    const artifactPath = path.join(tmpDir, artifact);
    if (fs.existsSync(artifactPath)) fs.rmSync(artifactPath);
  }

  const previousMain = setPackageMain(entry);
  const previousInjectJsEnd =
    options.injectJsEnd !== undefined ? setPackageInjectJsEnd(options.injectJsEnd) : undefined;
  const nwExe = resolveNwExe();

  const child = spawn(
    nwExe,
    [
      '.',
      '--onlykey-desktop-test',
      `--user-data-dir=${userDataDir}`,
      `--onlykey-test-result=${resultPath}`,
    ],
    {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }
  );

  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const result = await waitForResult(timeoutMs);
    result.stderr = stderr.trim() || undefined;
    return result;
  } finally {
    restorePackageMain(previousMain);
    if (options.injectJsEnd !== undefined) {
      restorePackageInjectJsEnd(previousInjectJsEnd);
    }
    if (!child.killed) {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
    stopStaleNwInstances();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  runDesktopHarness()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exit(1);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}