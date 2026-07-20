/**
 * NW.js desktop lifecycle — see docs/desktop-tray.md
 *
 * Main window (start via desktopInject.js): tray + menu + close-to-tray.
 * Matches https://github.com/nwutils/nw-tray-example (tray in the main renderer).
 * startBackground() exists for unit tests only.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const userPreferences = require('./userPreferences.cjs');

const SUPPRESS_SHOW_KEY = 'onlykeySuppressShow';

function tmpDir() {
  return path.join(nw.App.startPath, 'tmp');
}

function trayReadyPath() {
  return path.join(tmpDir(), 'tray-ready.json');
}

function clearTrayArtifacts() {
  try {
    fs.mkdirSync(tmpDir(), { recursive: true });
    for (const artifact of [
      'tray-ready.json',
      'tray-command.json',
      'suppress-show.json',
      'main-window.json',
    ]) {
      const artifactPath = path.join(tmpDir(), artifact);
      if (fs.existsSync(artifactPath)) fs.unlinkSync(artifactPath);
    }
  } catch (error) {
    console.error('clearTrayArtifacts failed:', error);
  }

  try {
    localStorage.removeItem('onlykeyTrayReady');
    localStorage.removeItem(SUPPRESS_SHOW_KEY);
  } catch {
    // ignore
  }
}

function trayCommandPath() {
  return path.join(tmpDir(), 'tray-command.json');
}

function suppressShowPath() {
  return path.join(tmpDir(), 'suppress-show.json');
}

const state = {
  tray: null,
  quitting: false,
  menu: null,
  menuLabels: [],
  mainStarted: false,
  backgroundStarted: false,
  commandPoll: null,
  lastCommandTs: null,
  mainAppWindow: null,
};

const osx = os.platform() === 'darwin';
const linux = os.platform() === 'linux';

function isDesktopTestMode() {
  try {
    return (nw.App.argv || []).some((arg) => arg.includes('--onlykey-desktop-test'));
  } catch {
    return false;
  }
}

function trayDebugEnabled() {
  try {
    return (nw.App.argv || []).some(
      (arg) =>
        arg.includes('--onlykey-tray-debug') ||
        arg.includes('--onlykey-dev') ||
        arg.includes('--devtools')
    );
  } catch {
    return false;
  }
}

function trayLog(message, data) {
  const entry = { ts: Date.now(), message, data: data ?? null };
  if (trayDebugEnabled()) {
    console.info('[onlykey-tray]', message, data ?? '');
  }
  try {
    fs.mkdirSync(tmpDir(), { recursive: true });
    fs.appendFileSync(path.join(tmpDir(), 'tray-debug.log'), `${JSON.stringify(entry)}\n`);
  } catch {
    // ignore
  }
}

function readTrayReadyMeta() {
  try {
    if (fs.existsSync(trayReadyPath())) {
      return JSON.parse(fs.readFileSync(trayReadyPath(), 'utf8'));
    }
  } catch {
    // ignore
  }
  return null;
}

function markTrayReady(ready) {
  try {
    fs.mkdirSync(tmpDir(), { recursive: true });
    if (ready) {
      fs.writeFileSync(
        trayReadyPath(),
        JSON.stringify({
          ready: true,
          pid: process.pid,
          ts: Date.now(),
          menuLabels: [...state.menuLabels],
          hasQuitMenuItem: state.menuLabels.includes('Quit OnlyKey App'),
        })
      );
    } else if (fs.existsSync(trayReadyPath())) {
      fs.unlinkSync(trayReadyPath());
    }
  } catch (error) {
    console.error('markTrayReady failed:', error);
  }

  try {
    if (ready) localStorage.setItem('onlykeyTrayReady', '1');
    else localStorage.removeItem('onlykeyTrayReady');
  } catch {
    // ignore
  }
}

function isTrayReadyInBackground() {
  if (state.backgroundStarted && ownsTray()) return true;
  return isTrayReadyOnDisk();
}

function isTrayReadyOnDisk() {
  return !!readTrayReadyMeta()?.ready;
}

function readSuppressShow() {
  try {
    return fs.existsSync(suppressShowPath());
  } catch {
    return false;
  }
}

function setSuppressShow(value) {
  try {
    fs.mkdirSync(tmpDir(), { recursive: true });
    if (value) fs.writeFileSync(suppressShowPath(), '1');
    else if (fs.existsSync(suppressShowPath())) fs.unlinkSync(suppressShowPath());
  } catch {
    // ignore
  }

  try {
    if (value) localStorage.setItem(SUPPRESS_SHOW_KEY, '1');
    else localStorage.removeItem(SUPPRESS_SHOW_KEY);
  } catch {
    // ignore
  }
}

function readCloseToTray() {
  try {
    if (typeof localStorage !== 'undefined') {
      const value = localStorage.getItem('closeToTray');
      if (value !== null) return value !== 'false';
    }
  } catch {
    // ignore
  }
  return userPreferences.closeToTray;
}

function windowHref(win) {
  try {
    return win.window?.location?.href || '';
  } catch {
    return '';
  }
}

function pageLocationHref() {
  try {
    return typeof window !== 'undefined' ? window.location?.href || '' : '';
  } catch {
    return '';
  }
}

function isBackgroundPageContext(nwWin) {
  const pageHref = pageLocationHref();
  if (pageHref.includes('desktopBg.html')) return true;
  if (pageHref.includes('_generated_background_page')) return true;
  if (!pageHref && !isMainAppWindow(nwWin)) return true;
  return !isMainAppWindow(nwWin);
}

function isTrayHostWindow(win) {
  if (!win) return false;
  const href = windowHref(win);
  if (href.includes('desktopBg.html')) return true;
  try {
    return win.width <= 2 && win.height <= 2;
  } catch {
    return false;
  }
}

function isMainAppWindow(win) {
  if (!win || isTrayHostWindow(win)) return false;
  if (!win) return false;

  const href = windowHref(win);
  if (href.includes('devtools://') || href.includes('chrome-devtools://')) return false;
  if (
    href.includes('index.html') ||
    href.includes('harness.html') ||
    href.includes('tray-verify-entry.html')
  ) {
    return true;
  }

  // Main window ref captured in start() (works when module state is shared).
  if (state.mainAppWindow && win === state.mainAppWindow) return true;

  // Tray-host cannot read other windows' location on Windows — use size heuristic.
  if (!href) {
    try {
      return (win.width || 0) >= 400 || (win.height || 0) >= 300;
    } catch {
      return false;
    }
  }

  return false;
}

function findMainAppWindows(wins) {
  const found = [];
  for (const win of wins || []) {
    if (isMainAppWindow(win)) found.push(win);
  }
  return found;
}

function forEachMainWindow(callback) {
  if (typeof nw.Window.getAll !== 'function') {
    const win = nw.Window.get();
    if (!isTrayHostWindow(win)) callback(win);
    return;
  }

  nw.Window.getAll((wins) => {
    const mainWins = findMainAppWindows(wins);
    trayLog('forEachMainWindow', {
      total: (wins || []).length,
      main: mainWins.length,
      hrefs: (wins || []).map((win) => windowHref(win)),
    });
    for (const win of mainWins) callback(win);
  });
}

function resolveTrayIconPath() {
  const candidates = [
    path.join(nw.App.startPath, 'resources', 'ok-tray-logo.png'),
    path.join(nw.App.startPath, 'ok-tray-logo.png'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate.replace(/\\/g, '/');
    }
  }

  throw new Error(`Tray icon missing under ${nw.App.startPath}`);
}

function revealWindow(win) {
  setSuppressShow(false);
  try {
    if (win.isMinimized) win.restore();
  } catch {
    // ignore
  }
  try {
    if (typeof win.setShowInTaskbar === 'function') win.setShowInTaskbar(true);
  } catch {
    // ignore
  }
  win.show(true);
  win.focus();
}

function executeShowMainWindow() {
  state.quitting = false;
  setSuppressShow(false);
  trayLog('executeShowMainWindow', {
    hasMainRef: !!state.mainAppWindow,
    inHost: state.backgroundStarted,
  });

  if (state.mainAppWindow && !isTrayHostWindow(state.mainAppWindow)) {
    try {
      revealWindow(state.mainAppWindow);
      trayLog('executeShowMainWindow via mainAppWindow ref');
      return;
    } catch (error) {
      trayLog('mainAppWindow reveal failed', { error: String(error) });
      state.mainAppWindow = null;
    }
  }

  forEachMainWindow((win) => {
    trayLog('executeShowMainWindow reveal', { href: windowHref(win) });
    revealWindow(win);
  });
}

function finishQuit() {
  markTrayReady(false);
  try {
    nw.App.quit();
  } catch (error) {
    console.error('App.quit failed:', error);
  }

  setTimeout(() => {
    try {
      process.exit(0);
    } catch {
      // ignore
    }
  }, 100);
}

function executeQuitApp() {
  if (state.quitting) return;
  state.quitting = true;
  setSuppressShow(false);
  trayLog('executeQuitApp');

  if (state.tray) {
    try {
      state.tray.remove();
    } catch (error) {
      console.error('Tray remove failed:', error);
    }
    state.tray = null;
  }
  markTrayReady(false);

  let finished = false;
  const closeAll = (wins) => {
    if (finished) return;
    finished = true;

    for (const win of wins || []) {
      try {
        win.removeAllListeners('close');
        win.close(true);
      } catch {
        // ignore
      }
    }
    finishQuit();
  };

  if (typeof nw.Window.getAll === 'function') {
    nw.Window.getAll((wins) => {
      const appWins = (wins || []).filter((win) => {
        const href = windowHref(win);
        return !href.includes('devtools://') && !href.includes('chrome-devtools://');
      });
      trayLog('executeQuitApp close windows', { count: appWins.length });
      closeAll(appWins.length ? appWins : wins);
    });
    setTimeout(() => {
      if (!finished) {
        const fallback = [];
        if (state.mainAppWindow) fallback.push(state.mainAppWindow);
        closeAll(fallback.length ? fallback : [nw.Window.get()]);
      }
    }, 500);
    return;
  }

  closeAll([nw.Window.get()]);
}

function ownsTray() {
  return !!state.tray;
}

function processTrayCommand(command) {
  trayLog('processTrayCommand', { command, ownsTray: ownsTray(), inHost: state.backgroundStarted });
  if (command === 'show') executeShowMainWindow();
  else if (command === 'quit') executeQuitApp();
}

function writeTrayCommand(command) {
  const ts = Date.now();
  try {
    fs.mkdirSync(tmpDir(), { recursive: true });
    fs.writeFileSync(trayCommandPath(), JSON.stringify({ command, ts }));
  } catch (error) {
    console.error('writeTrayCommand failed:', error);
  }
  return ts;
}

function dispatchTrayCommand(command) {
  const ts = writeTrayCommand(command);
  trayLog('dispatchTrayCommand', {
    command,
    ts,
    inHost: state.backgroundStarted,
    inMain: state.mainStarted,
  });

  // Tray-host-only renderer: menu clicks write the file; main window polls it.
  if (state.backgroundStarted && !state.mainStarted) return;

  if (state.mainStarted || ownsTray()) {
    processTrayCommand(command);
    state.lastCommandTs = String(ts);
    try {
      if (fs.existsSync(trayCommandPath())) fs.unlinkSync(trayCommandPath());
    } catch {
      // ignore
    }
  }
}

function pollTrayCommands() {
  // Only the main renderer runs start() and owns mainAppWindow.
  if (!state.mainStarted) return;

  let payload = null;

  try {
    if (!fs.existsSync(trayCommandPath())) return;
    payload = JSON.parse(fs.readFileSync(trayCommandPath(), 'utf8'));
  } catch {
    return;
  }

  if (!payload?.command || String(payload.ts) === state.lastCommandTs) return;

  state.lastCommandTs = String(payload.ts);
  try {
    fs.unlinkSync(trayCommandPath());
  } catch {
    // ignore
  }

  processTrayCommand(payload.command);
}

function showMainWindow() {
  dispatchTrayCommand('show');
}

function quitApp() {
  dispatchTrayCommand('quit');
}

function bindWindowCloseHandler(win) {
  if (!win || win._onlykeyCloseBound) return;
  win._onlykeyCloseBound = true;

  win.on('close', function onClose() {
    if (state.quitting) {
      this.close(true);
      return;
    }

    if (readCloseToTray()) {
      setSuppressShow(true);
      this.hide();
      return;
    }

    quitApp();
  });
}

function attachToAppWindows() {
  if (typeof nw.Window.getAll !== 'function') {
    bindWindowCloseHandler(nw.Window.get());
    return;
  }

  nw.Window.getAll((wins) => {
    for (const win of wins || []) {
      if (isMainAppWindow(win)) bindWindowCloseHandler(win);
    }
  });
}

function refreshMenuItem(menu, menuItem, index) {
  if (!linux) return;
  menu.remove(menuItem);
  menu.insert(menuItem, index);
  if (state.tray) state.tray.menu = menu;
}

async function initTray() {
  if (state.tray) return;

  const appPath = process.execPath;
  const appName = appPath.includes('node_modules') ? 'OnlyKey-dev' : 'OnlyKey';
  let autoLaunch = null;
  try {
    const AutoLaunch = require('auto-launch');
    autoLaunch = new AutoLaunch({
      name: appName,
      path: appPath,
      isHidden: !(osx || linux),
    });
  } catch (error) {
    console.error('AutoLaunch init skipped:', error);
  }

  const settingsMenu = new nw.Menu();

  const showWindowMenuItem = new nw.MenuItem({
    label: 'Show OnlyKey App',
    type: 'normal',
    click: function onShowClick() {
      trayLog('menu click Show');
      dispatchTrayCommand('show');
    },
  });

  const autoLaunchMenuItem = new nw.MenuItem({
    label: 'Auto-launch app on system login',
    type: 'checkbox',
    checked: userPreferences.autoLaunch,
    click: function () {
      if (!autoLaunch) return;
      userPreferences.autoLaunch = !userPreferences.autoLaunch;
      autoLaunch
        .isEnabled()
        .then((isEnabled) => {
          if (isEnabled && !userPreferences.autoLaunch) autoLaunch.disable();
          else if (!isEnabled && userPreferences.autoLaunch) autoLaunch.enable();
          refreshMenuItem(settingsMenu, autoLaunchMenuItem, 2);
        })
        .catch(console.error);
    },
  });

  const autoUpdateMenuItem = new nw.MenuItem({
    label: 'Automatically check for app updates',
    type: 'checkbox',
    checked: userPreferences.autoUpdate,
    click: function () {
      userPreferences.autoUpdate = !userPreferences.autoUpdate;
      autoUpdateMenuItem.checked = userPreferences.autoUpdate;
      refreshMenuItem(settingsMenu, autoUpdateMenuItem, 3);
    },
  });

  const autoUpdateFWMenuItem = new nw.MenuItem({
    label: 'Automatically check for firmware updates',
    type: 'checkbox',
    checked: userPreferences.autoUpdateFW,
    click: function () {
      userPreferences.autoUpdateFW = !userPreferences.autoUpdateFW;
      autoUpdateFWMenuItem.checked = userPreferences.autoUpdateFW;
      refreshMenuItem(settingsMenu, autoUpdateFWMenuItem, 4);
    },
  });

  const closeToTrayMenuItem = new nw.MenuItem({
    label: 'Hide to system tray when window is closed',
    type: 'checkbox',
    checked: userPreferences.closeToTray,
    click: function () {
      userPreferences.closeToTray = !userPreferences.closeToTray;
      closeToTrayMenuItem.checked = userPreferences.closeToTray;
      refreshMenuItem(settingsMenu, closeToTrayMenuItem, 5);
    },
  });

  const quitMenuItem = new nw.MenuItem({
    label: 'Quit OnlyKey App',
    type: 'normal',
    click: function onQuitClick() {
      trayLog('menu click Quit');
      dispatchTrayCommand('quit');
    },
  });

  settingsMenu.append(showWindowMenuItem);
  settingsMenu.append(new nw.MenuItem({ type: 'separator' }));
  settingsMenu.append(autoLaunchMenuItem);
  settingsMenu.append(autoUpdateMenuItem);
  settingsMenu.append(autoUpdateFWMenuItem);
  settingsMenu.append(closeToTrayMenuItem);
  settingsMenu.append(new nw.MenuItem({ type: 'separator' }));
  settingsMenu.append(quitMenuItem);

  state.menuLabels = [
    'Show OnlyKey App',
    'Auto-launch app on system login',
    'Automatically check for app updates',
    'Automatically check for firmware updates',
    'Hide to system tray when window is closed',
    'Quit OnlyKey App',
  ];

  const iconPath = resolveTrayIconPath();
  const tray = new nw.Tray({ icon: iconPath });
  state.tray = tray;
  state.menu = settingsMenu;
  if (!linux) tray.tooltip = 'OnlyKey Configuration App settings';

  if (!osx) {
    tray.on('click', () => {
      trayLog('tray icon click');
      dispatchTrayCommand('show');
    });
  }

  tray.menu = settingsMenu;
  trayLog('initTray complete', { iconPath, menuItems: state.menuLabels.length });

  markTrayReady(true);

  if (autoLaunch) {
    try {
      const autoLaunchEnabledInOSAtLaunch = await autoLaunch.isEnabled();
      userPreferences.autoLaunch = autoLaunchEnabledInOSAtLaunch;
      autoLaunchMenuItem.checked = !!autoLaunchEnabledInOSAtLaunch;
      refreshMenuItem(settingsMenu, autoLaunchMenuItem, 2);
    } catch {
      // auto-launch may not be supported on all platforms
    }
  }
}

function startCommandPolling() {
  if (state.commandPoll) return;
  state.commandPoll = setInterval(pollTrayCommands, 50);
}

/** bg-script entry — tray + menu. See docs/desktop-tray.md */
function startBackground(ctxWin) {
  const nwWin = ctxWin || nw.Window.get();
  const pageHref = pageLocationHref();

  if (!isDesktopTestMode() && isMainAppWindow(nwWin)) {
    trayLog('startBackground rejected — main window', {
      nwGetHref: windowHref(nwWin),
      pageHref,
    });
    return;
  }

  if (state.backgroundStarted) return;
  state.backgroundStarted = true;
  trayLog('startBackground', {
    nwGetHref: windowHref(nwWin),
    pageHref,
    isBackgroundPage: isBackgroundPageContext(nwWin),
  });

  markTrayReady(false);

  const launchTray = (attempt) => {
    initTray().catch((error) => {
      console.error(`Tray init failed in background (attempt ${attempt}):`, error);
      markTrayReady(false);
      if (attempt < 5) {
        setTimeout(() => launchTray(attempt + 1), 1000);
      }
    });
  };
  launchTray(1);

  attachToAppWindows();

  let polls = 0;
  const poll = setInterval(() => {
    attachToAppWindows();
    polls += 1;
    if (polls >= 40) clearInterval(poll);
  }, 500);
}

function writeMainWindowMarker(win) {
  try {
    fs.mkdirSync(tmpDir(), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir(), 'main-window.json'),
      JSON.stringify({ ts: Date.now(), href: windowHref(win), width: win.width, height: win.height })
    );
  } catch {
    // ignore
  }
}

function launchTrayInMain(attempt) {
  if (ownsTray()) return;
  initTray().catch((error) => {
    console.error(`Tray init failed in main window (attempt ${attempt}):`, error);
    markTrayReady(false);
    if (attempt < 5) {
      setTimeout(() => launchTrayInMain(attempt + 1), 1000);
    }
  });
}

/** Main window entry — tray, close handler, command polling (nw-tray-example pattern). */
function start() {
  if (state.mainStarted) return;
  state.mainStarted = true;

  clearTrayArtifacts();

  const mainWin = nw.Window.get();
  state.mainAppWindow = mainWin;
  writeMainWindowMarker(mainWin);
  trayLog('start main window', { href: windowHref(mainWin) });

  bindWindowCloseHandler(mainWin);
  attachToAppWindows();
  startCommandPolling();

  if (!state.backgroundStarted) {
    launchTrayInMain(1);
  }

  let polls = 0;
  const poll = setInterval(() => {
    if (typeof nw === 'undefined') {
      clearInterval(poll);
      return;
    }
    bindWindowCloseHandler(nw.Window.get());
    attachToAppWindows();
    polls += 1;
    if (polls >= 20) clearInterval(poll);
  }, 500);
}

function getTestState() {
  const iconPath = path.join(nw.App.startPath, 'resources', 'ok-tray-logo.png');
  const win = nw.Window.get();
  const trayMeta = readTrayReadyMeta();
  const menuLabels =
    state.menuLabels.length > 0 ? [...state.menuLabels] : [...(trayMeta?.menuLabels || [])];
  return {
    started: state.mainStarted || state.backgroundStarted,
    trayCreated: ownsTray() || isTrayReadyInBackground(),
    trayInBackground: isTrayReadyInBackground(),
    trayInMainContext: ownsTray() && state.backgroundStarted === false && state.mainStarted,
    ownsTray: ownsTray(),
    closeHandlerBound: !!(win && win._onlykeyCloseBound),
    menuLabels,
    hasQuitMenuItem:
      state.menuLabels.includes('Quit OnlyKey App') || !!trayMeta?.hasQuitMenuItem,
    iconPath,
    iconExists: fs.existsSync(iconPath),
    closeToTray: readCloseToTray(),
    quitting: state.quitting,
    windowVisible: !!(win && win.isVisible),
    windowHidden: !!(win && !win.isVisible),
    suppressStored: (() => {
      try {
        return localStorage.getItem(SUPPRESS_SHOW_KEY);
      } catch {
        return null;
      }
    })(),
    isDesktopTestMode: isDesktopTestMode(),
  };
}

module.exports = {
  start,
  startBackground,
  clearTrayArtifacts,
  showMainWindow,
  quitApp,
  dispatchTrayCommand,
  processTrayCommand,
  bindWindowCloseHandler,
  readCloseToTray,
  readSuppressShow,
  setSuppressShow,
  isTrayReadyInBackground,
  isTrayReadyOnDisk,
  getTestState,
  _state: state,
};