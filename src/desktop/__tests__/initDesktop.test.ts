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
});
