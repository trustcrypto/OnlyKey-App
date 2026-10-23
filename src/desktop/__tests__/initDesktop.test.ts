import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const start = vi.fn();
const bindWindowVisibilityHandlers = vi.fn();

vi.mock('../windowVisibility', () => ({
  bindWindowVisibilityHandlers: (...args: unknown[]) => bindWindowVisibilityHandlers(...args),
}));

vi.mock('../appRoot', () => ({
  resolveAppRoot: () => '/__onlykey-missing-app-root__',
  loadDesktopShell: () => ({ start }),
}));

describe('initDesktop', () => {
  beforeEach(() => {
    start.mockClear();
    bindWindowVisibilityHandlers.mockClear();
    vi.stubGlobal('nw', {
      App: { startPath: process.cwd() },
      Window: { get: () => ({ id: 1 }) },
      Shell: { openExternal: vi.fn() },
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts the desktop shell and binds visibility without checking for updates', async () => {
    vi.useFakeTimers();
    const { initDesktop } = await import('../initDesktop');
    await initDesktop();
    expect(start).toHaveBeenCalled();
    expect(bindWindowVisibilityHandlers).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(bindWindowVisibilityHandlers.mock.calls.length).toBeGreaterThanOrEqual(2);
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
