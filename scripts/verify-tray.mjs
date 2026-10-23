#!/usr/bin/env node
/**
 * Validates the real npm-start entry (dist/index.html) creates a tray in the tray host window.
 * Spawns NW.js headlessly and exits non-zero if the tray is missing.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDistTrayVerifyEntry } from './dist-tray-verify-entry.mjs';
import { runDesktopHarness } from './desktop-test-runner.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ensureBuild() {
  const distIndex = path.join(rootDir, 'dist', 'index.html');
  if (!fs.existsSync(distIndex)) {
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
  }
}

async function main() {
  ensureBuild();

  const entry = buildDistTrayVerifyEntry();
  const result = await runDesktopHarness({
    entry,
    userDataDir: path.join('tmp', 'desktop-test-user-data-dist-entry'),
    timeoutMs: 60_000,
  });

  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    console.error('Tray verification failed for dist/index.html (npm start entry).');
    process.exit(1);
  }

  console.log(
    'Tray verification passed: background tray ready on dist/index.html (npm start entry).'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});