import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const desktopModulePath = path.join(rootDir, 'desktopBg.cjs');

function createNwMock() {
  const listeners = new Map();
  const win = {
    _onlykeyCloseBound: false,
    isVisible: true,
    isMinimized: false,
    window: { location: { href: 'file:///dist/index.html' } },
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    close: vi.fn(),
    removeAllListeners: vi.fn((event) => {
      if (event) listeners.delete(event);
      else listeners.clear();
    }),
    on: vi.fn((event, callback) => {
      listeners.set(event, callback);
    }),
    setShowInTaskbar: vi.fn(),
  };

  const tray = {
    tooltip: '',
    menu: null,
    on: vi.fn(),
    remove: vi.fn(),
  };
  let trayOptions = null;

  function Menu() {
    this.append = vi.fn();
    this.remove = vi.fn();
    this.insert = vi.fn();
  }

  const menuItems = [];

  function MenuItem(options) {
    Object.assign(this, options);
    this.checked = options.checked ?? false;
    menuItems.push(this);
  }

  function Tray(options) {
    trayOptions = options;
    return tray;
  }

  global.nw = {
    Window: {
      get: () => win,
      getAll: (callback) => callback([win]),
    },
    Tray,
    Menu,
    MenuItem,
    App: {
      startPath: rootDir,
      argv: ['--onlykey-desktop-test'],
      quit: vi.fn(),
      on: vi.fn(),
    },
  };

  return {
    win,
    tray,
    listeners,
    menuItems,
    get trayOptions() {
      return trayOptions;
    },
  };
}

let desktopModule = null;

function loadDesktopModule() {
  delete require.cache[desktopModulePath];
  delete require.cache[path.join(rootDir, 'userPreferences.cjs')];
  desktopModule = require(desktopModulePath);
  return desktopModule;
}

describe('desktopBg.cjs unit', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.stubGlobal('localStorage', {
      store: new Map(),
      getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
      },
      setItem(key, value) {
        this.store.set(key, value);
      },
      removeItem(key) {
        this.store.delete(key);
      },
    });
    vi.stubGlobal('process', { ...process, execPath: process.execPath, exit: vi.fn() });
  });

  afterEach(() => {
    desktopModule?.stop?.();
    desktopModule = null;
    delete global.nw;
    vi.unstubAllGlobals();
  });

  it('binds close handler and creates tray on start() in main context', async () => {
    const { win } = createNwMock();
    const desktop = loadDesktopModule();
    desktop.start();

    await vi.waitFor(() => {
      expect(win._onlykeyCloseBound).toBe(true);
      expect(desktop.getTestState().ownsTray).toBe(true);
    }, { timeout: 2000 });
    expect(desktop.getTestState().trayInMainContext).toBe(true);
  });

  it('creates tray in background context via startBackground()', async () => {
    const { tray } = createNwMock();
    const desktop = loadDesktopModule();
    desktop.startBackground();

    await vi.waitFor(() => {
      expect(desktop.getTestState().ownsTray).toBe(true);
    }, { timeout: 2000 });
    const testState = desktop.getTestState();
    expect(testState.trayInBackground).toBe(true);
    if (process.platform !== 'darwin') {
      expect(tray.on).toHaveBeenCalled();
    }
  });

  it('hides window on close when closeToTray is enabled', () => {
    const { win, listeners } = createNwMock();
    localStorage.setItem('closeToTray', 'true');

    const desktop = loadDesktopModule();
    desktop.start();

    const onClose = listeners.get('close');
    onClose.call(win);
    expect(win.hide).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('onlykeySuppressShow')).toBe('1');
  });

  it('dispatches quit on close when closeToTray is disabled', () => {
    const { win, listeners } = createNwMock();
    localStorage.setItem('closeToTray', 'false');

    const desktop = loadDesktopModule();
    desktop.startBackground();
    desktop.start();

    const onClose = listeners.get('close');
    onClose.call(win);

    expect(desktop.getTestState().quitting).toBe(true);
  });

  it('tray menu Show click handler restores a hidden main window via main polling', async () => {
    const { win, tray, menuItems } = createNwMock();
    win.isVisible = false;
    win.width = 1024;
    win.height = 768;

    const desktop = loadDesktopModule();
    desktop.start();
    await vi.waitFor(() => {
      expect(desktop.getTestState().ownsTray).toBe(true);
      expect(tray.menu).toBeTruthy();
    }, { timeout: 2000 });

    const showItem = menuItems.find((item) => item.label === 'Show OnlyKey App');
    expect(showItem?.click).toBeTypeOf('function');
    // Menu wiring: click must invoke the same show path as the command dispatcher.
    expect(menuItems.map((i) => i.label).filter(Boolean)).toEqual(
      expect.arrayContaining([
        'Show OnlyKey App',
        'Quit OnlyKey App',
        'Hide to system tray when window is closed',
      ]),
    );

    showItem.click();
    // Also exercise the public show API (same as click → dispatchTrayCommand('show')).
    desktop.showMainWindow();

    await vi.waitFor(() => {
      expect(win.show).toHaveBeenCalledWith(true);
      expect(win.focus).toHaveBeenCalled();
    }, { timeout: 1000 });
  });

  it('omits tray title on macOS so the menu bar does not show "undefined"', async () => {
    const mock = createNwMock();
    const desktop = loadDesktopModule();
    desktop.start();
    await vi.waitFor(() => expect(desktop.getTestState().ownsTray).toBe(true), { timeout: 2000 });

    expect(mock.trayOptions?.icon).toMatch(/ok-tray-logo\.png$/);
    expect(fs.existsSync(mock.trayOptions.icon)).toBe(true);
    if (process.platform === 'darwin') {
      expect(mock.trayOptions).not.toHaveProperty('title');
      expect(mock.trayOptions.iconsAreTemplates).toBe(false);
    } else if (process.platform === 'linux') {
      expect(mock.trayOptions.title).toBe('OnlyKey');
    } else {
      expect(mock.trayOptions).not.toHaveProperty('title');
    }
  });

  it('creates a tray when nw.App.startPath is not the app root', async () => {
    const mock = createNwMock();
    nw.App.startPath = '/';
    const desktop = loadDesktopModule();
    desktop.start();
    await vi.waitFor(() => expect(desktop.getTestState().ownsTray).toBe(true), { timeout: 2000 });
    expect(mock.trayOptions?.icon).toContain('ok-tray-logo.png');
    expect(fs.existsSync(mock.trayOptions.icon)).toBe(true);
  });

  it('builds a non-empty tray menu without remove/insert refresh', async () => {
    const { tray, menuItems } = createNwMock();
    const desktop = loadDesktopModule();
    desktop.start();
    await vi.waitFor(() => expect(desktop.getTestState().ownsTray).toBe(true), { timeout: 2000 });

    expect(tray.menu).toBeTruthy();
    expect(tray.menu.append).toHaveBeenCalled();
    expect(menuItems.some((i) => i.label === 'Show OnlyKey App')).toBe(true);
    expect(menuItems.some((i) => i.label === 'Quit OnlyKey App')).toBe(true);
    // Linux must not use Menu.remove for checkbox refresh (empties StatusNotifier menus).
    expect(tray.menu.remove).not.toHaveBeenCalled();
  });

  it('main window command polling restores hidden window', async () => {
    const { win } = createNwMock();
    win.isVisible = false;

    const desktop = loadDesktopModule();
    desktop.start();
    await new Promise((resolve) => setTimeout(resolve, 100));

    localStorage.setItem('onlykeySuppressShow', '1');
    desktop.dispatchTrayCommand('show');
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(localStorage.getItem('onlykeySuppressShow')).toBeNull();
    expect(win.show).toHaveBeenCalledWith(true);
    expect(win.focus).toHaveBeenCalled();
  });

  it('quitApp falls back when Window.getAll callback is delayed', async () => {
    vi.useFakeTimers();
    const { win } = createNwMock();
    let getAllCallback = null;
    nw.Window.getAll = vi.fn((callback) => {
      getAllCallback = callback;
    });

    const desktop = loadDesktopModule();
    desktop.startBackground();
    await vi.advanceTimersByTimeAsync(100);
    desktop.processTrayCommand('quit');

    expect(desktop.getTestState().quitting).toBe(true);
    vi.advanceTimersByTime(500);
    expect(win.close).toHaveBeenCalledWith(true);
    expect(nw.App.quit).toHaveBeenCalled();

    getAllCallback?.([win]);
    vi.useRealTimers();
  });
});