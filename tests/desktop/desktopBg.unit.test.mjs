import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const desktopModulePath = path.join(rootDir, 'desktopBg.cjs');

function createNwMock(options = {}) {
  const listeners = new Map();
  const appListeners = new Map();
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
      argv: options.argv || ['--onlykey-desktop-test'],
      fullArgv: options.fullArgv || [],
      quit: vi.fn(),
      on: vi.fn((event, callback) => {
        const list = appListeners.get(event) || [];
        list.push(callback);
        appListeners.set(event, list);
      }),
      removeListener: vi.fn((event, callback) => {
        const list = appListeners.get(event) || [];
        appListeners.set(
          event,
          list.filter((fn) => fn !== callback),
        );
      }),
    },
  };

  return {
    win,
    tray,
    listeners,
    appListeners,
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
        'Autostart to tray',
        'Quit OnlyKey App',
        'Hide to system tray when window is closed',
      ]),
    );
    expect(menuItems.some((i) => i.label === 'Auto-launch app on system login')).toBe(false);

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
    global.nw.App.startPath = '/';
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
    global.nw.Window.getAll = vi.fn((callback) => {
      getAllCallback = callback;
    });

    const desktop = loadDesktopModule();
    desktop.startBackground();
    await vi.advanceTimersByTimeAsync(100);
    desktop.processTrayCommand('quit');

    expect(desktop.getTestState().quitting).toBe(true);
    vi.advanceTimersByTime(500);
    expect(win.close).toHaveBeenCalledWith(true);
    expect(global.nw.App.quit).toHaveBeenCalled();

    getAllCallback?.([win]);
    vi.useRealTimers();
  });

  it('starts in the tray when launched with --hidden', () => {
    const { win } = createNwMock({ argv: ['--onlykey-desktop-test', '--hidden'] });
    const desktop = loadDesktopModule();
    desktop.start();

    expect(desktop.launchedHiddenToTray()).toBe(true);
    expect(win.hide).toHaveBeenCalled();
    expect(win.setShowInTaskbar).toHaveBeenCalledWith(false);
    expect(localStorage.getItem('onlykeySuppressShow')).toBe('1');
    expect(win.show).not.toHaveBeenCalled();
  });

  it('registers autostart as a hidden to-tray launch', async () => {
    const autoLaunchPath = require.resolve('auto-launch');
    const previous = require.cache[autoLaunchPath];
    function FakeAutoLaunch(opts) {
      this.opts = opts;
      FakeAutoLaunch.instances.push(this);
      this.isEnabled = vi.fn(() => Promise.resolve(false));
      this.enable = vi.fn(() => Promise.resolve());
      this.disable = vi.fn(() => Promise.resolve());
    }
    FakeAutoLaunch.instances = [];
    require.cache[autoLaunchPath] = {
      id: autoLaunchPath,
      filename: autoLaunchPath,
      loaded: true,
      exports: FakeAutoLaunch,
    };

    try {
      createNwMock();
      const desktop = loadDesktopModule();
      desktop.start();
      await vi.waitFor(() => expect(desktop.getTestState().ownsTray).toBe(true), { timeout: 2000 });

      expect(FakeAutoLaunch.instances.length).toBeGreaterThan(0);
      expect(FakeAutoLaunch.instances[0].opts.isHidden).toBe(true);
      expect(FakeAutoLaunch.instances[0].opts.mac).toEqual({ useLaunchAgent: true });
      expect(FakeAutoLaunch.instances[0].enable).not.toHaveBeenCalled();
      expect(FakeAutoLaunch.instances[0].disable).not.toHaveBeenCalled();
    } finally {
      if (previous) require.cache[autoLaunchPath] = previous;
      else delete require.cache[autoLaunchPath];
    }
  });

  it('restores a tray-hidden window when the executable is launched again', () => {
    const { win, listeners, appListeners } = createNwMock();
    localStorage.setItem('closeToTray', 'true');
    const desktop = loadDesktopModule();
    desktop.start();

    listeners.get('close').call(win);
    expect(localStorage.getItem('onlykeySuppressShow')).toBe('1');
    win.show.mockClear();
    win.focus.mockClear();

    const openHandlers = appListeners.get('open');
    expect(openHandlers?.length).toBeGreaterThan(0);
    openHandlers[0]('C:\\Program Files\\OnlyKey\\nw.exe');

    expect(localStorage.getItem('onlykeySuppressShow')).toBeNull();
    expect(win.show).toHaveBeenCalledWith(true);
    expect(win.focus).toHaveBeenCalled();
    expect(win.setShowInTaskbar).toHaveBeenCalledWith(true);
  });

  it('stays in the tray when a second launch is autostart --hidden', () => {
    const { win, listeners, appListeners } = createNwMock();
    localStorage.setItem('closeToTray', 'true');
    const desktop = loadDesktopModule();
    desktop.start();

    listeners.get('close').call(win);
    win.show.mockClear();
    appListeners.get('open')[0]('"C:\\Program Files\\OnlyKey\\nw.exe" --hidden');

    expect(win.show).not.toHaveBeenCalled();
    expect(localStorage.getItem('onlykeySuppressShow')).toBe('1');
  });

  it('restores the window when macOS reopens the app from the Dock', () => {
    const { win, listeners, appListeners } = createNwMock();
    localStorage.setItem('closeToTray', 'true');
    const desktop = loadDesktopModule();
    desktop.start();

    listeners.get('close').call(win);
    win.show.mockClear();
    appListeners.get('reopen')[0]();

    expect(win.show).toHaveBeenCalledWith(true);
    expect(localStorage.getItem('onlykeySuppressShow')).toBeNull();
  });

  it('command poll restores a hidden window from a launcher show file', async () => {
    const { win } = createNwMock();
    win.isVisible = false;
    const desktop = loadDesktopModule();
    desktop.start();
    localStorage.setItem('onlykeySuppressShow', '1');

    const commandPath = path.join(rootDir, 'tmp', 'tray-command.json');
    fs.mkdirSync(path.dirname(commandPath), { recursive: true });
    fs.writeFileSync(commandPath, JSON.stringify({ command: 'show', ts: Date.now() }));

    await vi.waitFor(() => {
      expect(win.show).toHaveBeenCalledWith(true);
    }, { timeout: 1000 });
    expect(localStorage.getItem('onlykeySuppressShow')).toBeNull();
    expect(fs.existsSync(commandPath)).toBe(false);
  });

  it('does not touch nw after stop() tears the mock down', async () => {
    const errors = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.map(String).join(' '));
    });

    createNwMock();
    const desktop = loadDesktopModule();
    desktop.start();
    desktop.stop();
    delete global.nw;

    await new Promise((resolve) => setTimeout(resolve, 250));
    spy.mockRestore();

    expect(errors.join('\n')).not.toMatch(/nw is not defined/);
  });
});