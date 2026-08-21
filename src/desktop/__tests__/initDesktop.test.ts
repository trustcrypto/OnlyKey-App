import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const start = vi.fn();
const checkForAppUpdate = vi.fn().mockResolvedValue(undefined);
const bindWindowVisibilityHandlers = vi.fn();

vi.mock('../updater', () => ({
  checkForAppUpdate: (...args: unknown[]) => checkForAppUpdate(...args),
}));

vi.mock('../windowVisibility', () => ({
  bindWindowVisibilityHandlers: (...args: unknown[]) => bindWindowVisibilityHandlers(...args),
}));

describe('initDesktop', () => {
  beforeEach(() => {
    start.mockClear();
    checkForAppUpdate.mockClear();
    bindWindowVisibilityHandlers.mockClear();
    vi.stubGlobal('nw', {
      App: { startPath: process.cwd() },
      Window: { get: () => ({ id: 1 }) },
      Shell: { openExternal: vi.fn() },
    });
    vi.stubGlobal('require', (id: string) => {
      if (id.includes('desktopBg.cjs')) return { start };
      return require(id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts the desktop shell, binds visibility, and checks for app updates', async () => {
    vi.useFakeTimers();
    const { initDesktop } = await import('../initDesktop');
    await initDesktop();
    expect(bindWindowVisibilityHandlers).toHaveBeenCalled();
    expect(checkForAppUpdate).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(bindWindowVisibilityHandlers.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('resolves a darwin app root and falls back when desktopBg.cjs is missing', async () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin', execPath: 'C:\\OnlyKey.app\\Contents\\MacOS\\nw' });
    vi.stubGlobal('require', (id: string) => {
      if (id === 'fs') return { existsSync: () => false };
      if (id === 'path') return require('path');
      if (String(id).includes('desktopBg.cjs')) return { start };
      return require(id);
    });
    const { initDesktop } = await import('../initDesktop');
    await initDesktop();
    expect(bindWindowVisibilityHandlers).toHaveBeenCalled();
  });

  it('opens http links in the system browser and ignores missing desktop start', async () => {
    start.mockImplementation(() => {
      throw new Error('no tray');
    });
    const openExternal = vi.fn();
    vi.stubGlobal('nw', {
      App: { startPath: process.cwd() },
      Window: { get: () => ({ id: 1 }) },
      Shell: { openExternal },
    });
    const { initDesktop } = await import('../initDesktop');
    await initDesktop();

    const anchor = document.createElement('a');
    anchor.href = 'https://docs.crp.to/usersguide.html';
    document.body.appendChild(anchor);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    expect(openExternal).toHaveBeenCalledWith(anchor.href);
    expect(event.defaultPrevented).toBe(true);
    anchor.remove();
  });
});
