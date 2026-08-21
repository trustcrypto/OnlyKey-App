import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindCloseToTrayOrQuit,
  bindWindowVisibilityHandlers,
  centerWindowOnScreen,
  ensureWindowVisible,
  isDevRuntime,
} from '../windowVisibility';

function fakeWin(overrides: Record<string, unknown> = {}) {
  return {
    isVisible: false,
    isMinimized: false,
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    moveTo: vi.fn(),
    hide: vi.fn(),
    on: vi.fn(),
    ...overrides,
  };
}

describe('windowVisibility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('nw', {
      App: { startPath: '/tmp', quit: vi.fn() },
      Screen: { screens: [{ isBuiltIn: true, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }] },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects --onlykey-dev as a dev runtime', () => {
    const orig = process.argv;
    process.argv = ['node', 'app', '--onlykey-dev'];
    expect(isDevRuntime()).toBe(true);
    process.argv = orig;
  });

  it('shows and focuses a hidden window', () => {
    const win = fakeWin();
    ensureWindowVisible(win);
    expect(win.show).toHaveBeenCalledWith(true);
    expect(win.focus).toHaveBeenCalled();
  });

  it('skips show when onlykeySuppressShow is set', () => {
    localStorage.setItem('onlykeySuppressShow', '1');
    const win = fakeWin();
    ensureWindowVisible(win);
    expect(win.show).not.toHaveBeenCalled();
  });

  it('centers on the primary screen', () => {
    const win = fakeWin({ width: 800, height: 600 });
    centerWindowOnScreen(win);
    expect(win.moveTo).toHaveBeenCalled();
  });

  it('binds loaded/focus/restore handlers', () => {
    const win = fakeWin({ isVisible: true });
    bindWindowVisibilityHandlers(win);
    expect(win.on).toHaveBeenCalledWith('loaded', expect.any(Function));
    expect(win.on).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(win.on).toHaveBeenCalledWith('restore', expect.any(Function));
  });

  it('bindCloseToTrayOrQuit hides on close outside dev', () => {
    const orig = process.argv;
    process.argv = ['node', 'app'];
    const win = fakeWin();
    bindCloseToTrayOrQuit(win);
    const close = (win.on as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'close')?.[1] as () => void;
    close();
    expect(win.hide).toHaveBeenCalled();
    expect(localStorage.getItem('onlykeySuppressShow')).toBe('1');
    process.argv = orig;
  });

  it('bindCloseToTrayOrQuit is idempotent', () => {
    const win = fakeWin();
    bindCloseToTrayOrQuit(win);
    bindCloseToTrayOrQuit(win);
    const closeCalls = (win.on as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'close');
    expect(closeCalls).toHaveLength(1);
  });

  it('treats an nw binary under node_modules as a dev runtime', () => {
    const orig = process.execPath;
    Object.defineProperty(process, 'execPath', { value: '/app/node_modules/nw/nw.exe', configurable: true });
    const argv = process.argv;
    process.argv = ['nw'];
    expect(isDevRuntime()).toBe(true);
    process.argv = argv;
    Object.defineProperty(process, 'execPath', { value: orig, configurable: true });
  });

  it('restores a minimized window and runs bound loaded/focus handlers', () => {
    const win = fakeWin({ isMinimized: true, isVisible: false });
    bindWindowVisibilityHandlers(win);
    expect(win.restore).toHaveBeenCalled();
    const handlers = Object.fromEntries(
      (win.on as ReturnType<typeof vi.fn>).mock.calls.map((c) => [c[0], c[1]]),
    );
    handlers.loaded();
    handlers.focus();
    handlers.restore();
    expect(win.focus).toHaveBeenCalled();
  });

  it('does not center when Screen has no displays', () => {
    vi.stubGlobal('nw', { App: { startPath: '/tmp' }, Screen: { screens: [] } });
    const win = fakeWin();
    centerWindowOnScreen(win);
    expect(win.moveTo).not.toHaveBeenCalled();
  });

  it('quits on close in a dev runtime', () => {
    const orig = process.argv;
    process.argv = ['node', 'app', '--onlykey-dev'];
    const win = fakeWin();
    bindCloseToTrayOrQuit(win);
    const close = (win.on as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === 'close')?.[1] as () => void;
    close();
    expect((globalThis as unknown as { nw: { App: { quit: ReturnType<typeof vi.fn> } } }).nw.App.quit).toHaveBeenCalled();
    process.argv = orig;
  });
});
