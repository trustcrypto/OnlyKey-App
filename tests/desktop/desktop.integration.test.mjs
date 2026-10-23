import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDesktopHarness } from '../../scripts/desktop-test-runner.mjs';
import { buildDistTrayVerifyEntry } from '../../scripts/dist-tray-verify-entry.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('NW.js desktop integration', () => {
  beforeAll(() => {
    if (!fs.existsSync(path.join(rootDir, 'node_modules', 'nw'))) {
      throw new Error('NW.js is not installed — run npm install before desktop integration tests.');
    }
    if (!fs.existsSync(path.join(rootDir, 'dist', 'index.html'))) {
      execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
    }
  });

  it(
    'background tray becomes ready on dist/index.html (npm start entry)',
    async () => {
      const result = await runDesktopHarness({
        entry: buildDistTrayVerifyEntry(),
        userDataDir: path.join('tmp', 'desktop-test-user-data-dist-entry'),
      });
      expect(result.ok, result.error || JSON.stringify(result.state)).toBe(true);
      expect(result.state.trayInMainContext).toBe(true);
      expect(result.state.hasQuitMenuItem).toBe(true);
      expect(result.state.iconExists).toBe(true);
      expect(result.state.closeHandlerBound).toBe(true);
    },
    60_000
  );

  it(
    'tray menu show works while main window is hidden (background command path)',
    async () => {
      const result = await runDesktopHarness({
        entry: 'tests/desktop/tray-menu-when-hidden.harness.html',
        userDataDir: path.join('tmp', 'desktop-test-user-data-tray-menu-hidden'),
      });
      expect(result.ok, result.error || JSON.stringify(result.state)).toBe(true);
      expect(result.state.trayInMainContext).toBe(true);
      expect(result.state.hiddenBeforeMenu).toBe(true);
      expect(result.state.visibleAfterMenuShow).toBe(true);
      expect(result.state.suppressCleared).toBe(true);
    },
    60_000
  );

  it(
    'creates tray and binds close handler in desktop harness',
    async () => {
      const result = await runDesktopHarness({
        entry: 'tests/desktop/desktop.harness.html',
        userDataDir: path.join('tmp', 'desktop-test-user-data-harness'),
      });
      expect(result.ok, result.error || JSON.stringify(result.state)).toBe(true);
      expect(result.state.trayInMainContext).toBe(true);
      expect(result.state.closeHandlerBound).toBe(true);
      expect(result.state.iconExists).toBe(true);
    },
    60_000
  );

  it(
    'creates tray via production-style index bootstrap',
    async () => {
      const result = await runDesktopHarness({
        entry: 'tests/desktop/production.harness.html',
        userDataDir: path.join('tmp', 'desktop-test-user-data-production'),
      });
      expect(result.ok, result.error || JSON.stringify(result.state)).toBe(true);
      expect(result.state.trayInMainContext).toBe(true);
      expect(result.state.closeHandlerBound).toBe(true);
    },
    60_000
  );

  it(
    'still creates a working tray when tmp/tray-ready.json is stale from a prior run',
    async () => {
      const stalePath = path.join(rootDir, 'tmp', 'tray-ready.json');
      fs.mkdirSync(path.dirname(stalePath), { recursive: true });
      fs.writeFileSync(
        stalePath,
        JSON.stringify({ ready: true, ts: 1, hasQuitMenuItem: true, menuLabels: ['Show OnlyKey App'] })
      );

      const result = await runDesktopHarness({
        entry: 'tests/desktop/desktop.harness.html',
        userDataDir: path.join('tmp', 'desktop-test-user-data-stale-tray-ready'),
      });

      expect(result.ok, result.error || JSON.stringify(result.state)).toBe(true);
      expect(result.state.trayInMainContext).toBe(true);
      expect(result.state.hasQuitMenuItem).toBe(true);
    },
    60_000
  );

  it(
    'restores window after hide via background tray command',
    async () => {
      const result = await runDesktopHarness({
        entry: 'tests/desktop/hide-show.harness.html',
        userDataDir: path.join('tmp', 'desktop-test-user-data-hide-show'),
      });
      expect(result.ok, result.error || JSON.stringify(result.state)).toBe(true);
      expect(result.state.hiddenBeforeShow).toBe(true);
      expect(result.state.visibleAfterShow).toBe(true);
      expect(result.state.suppressCleared).toBe(true);
      expect(result.state.trayInMainContext).toBe(true);
    },
    60_000
  );
});