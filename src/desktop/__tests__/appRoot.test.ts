import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDesktopShell, resolveAppRoot } from '../appRoot';

describe('resolveAppRoot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns a directory that contains desktopBg.cjs', () => {
    vi.stubGlobal('nw', { App: { startPath: process.cwd() } });
    const root = resolveAppRoot();
    expect(fs.existsSync(path.join(root, 'desktopBg.cjs'))).toBe(true);
  });

  it('falls back to startPath when no candidate has desktopBg.cjs', () => {
    vi.stubGlobal('nw', { App: { startPath: '/nowhere' } });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(resolveAppRoot()).toBe('/nowhere');
  });

  it('ignores throws while collecting startPath and execPath', () => {
    vi.stubGlobal('nw', {
      App: {
        get startPath() {
          throw new Error('no startPath');
        },
      },
    });
    vi.stubGlobal('process', {
      get platform() {
        return 'win32';
      },
      get execPath() {
        throw new Error('no execPath');
      },
      cwd: () => process.cwd(),
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(() => resolveAppRoot()).toThrow();
  });

  it('loadDesktopShell returns null when nw is undefined', () => {
    expect(loadDesktopShell()).toBeNull();
  });

  it('probes the darwin app.nw path from execPath', () => {
    vi.stubGlobal('nw', { App: { startPath: '/' } });
    vi.stubGlobal('process', {
      ...process,
      platform: 'darwin',
      execPath: '/Applications/OnlyKey App.app/Contents/MacOS/nw',
    });
    const spy = vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
      return String(p).replace(/\\/g, '/').includes('/Contents/Resources/app.nw/desktopBg.cjs');
    });
    const root = resolveAppRoot();
    expect(spy.mock.calls.some((args) => String(args[0]).replace(/\\/g, '/').includes('/Contents/Resources/app.nw/desktopBg.cjs'))).toBe(true);
    expect(root.replace(/\\/g, '/')).toContain('/Contents/Resources/app.nw');
  });
});
