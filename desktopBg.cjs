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
const { createLoginAutostart } = require('./loginAutostart.cjs');

const SUPPRESS_SHOW_KEY = 'onlykeySuppressShow';
const LOGIN_ITEM_EXPLAINED_KEY = 'onlykey.loginItemAccessExplained';
const LOGIN_ITEM_ACCESS_DETAIL =
  'OnlyKey uses this once to remove login items left by older versions, so the app starts once in the tray.';

function isLikelyAppRoot(dir) {
  try {
    return !!dir && dir !== path.parse(dir).root && fs.existsSync(path.join(dir, 'desktopBg.cjs'));
  } catch {
    return false;
  }
}

function resolveAppRoot() {
  const candidates = [__dirname];
  try {
    if (typeof nw !== 'undefined' && nw.App && nw.App.startPath) {
      candidates.push(nw.App.startPath);
    }
  } catch {
    // ignore
  }
  try {
    if (os.platform() === 'darwin' && process.execPath) {
      candidates.push(path.resolve(path.dirname(process.execPath), '..', 'Resources', 'app.nw'));
    }
  } catch {
    // ignore
  }
  try {
    if (process.execPath) candidates.push(path.dirname(process.execPath));
  } catch {
    // ignore
  }
  try {
    candidates.push(process.cwd());
  } catch {
    // ignore
  }

  for (const dir of candidates) {
    if (isLikelyAppRoot(dir)) return dir;
  }
  return __dirname;
}

function tmpDirCandidates() {
  const dirs = [];
  const push = (dir) => {
    if (!dir || dirs.includes(dir)) return;
    dirs.push(dir);
  };
  try {
    push(path.join(resolveAppRoot(), 'tmp'));
  } catch {
    // ignore
  }
  try {
    push(path.join(os.homedir(), '.config', 'OnlyKey', 'app-tmp'));
  } catch {
    // ignore
  }
  push(path.join(os.tmpdir(), 'onlykey-app'));
  return dirs;
}

function tmpDir() {
  // Dev checkouts can write under the app root. Installed copies under
  // /Applications or /opt/OnlyKey are not writable, so fall back to a
  // per-user directory. Do not treat Finder cwd `/` as the app root.
  const candidates = [];
  try {
    candidates.push(path.join(resolveAppRoot(), 'tmp'));
  } catch {
    // ignore
  }
  try {
    candidates.push(path.join(os.homedir(), '.config', 'OnlyKey', 'app-tmp'));
  } catch {
    // ignore
  }
  candidates.push(path.join(os.tmpdir(), 'onlykey-app'));

  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      // try next
    }
  }
  return path.join(os.tmpdir(), 'onlykey-app');
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

  // A launcher may have dropped a show request in a different writable tmp
  // than the one this process picked. Drop those on a real startup so a stale
  // file cannot pop the window during autostart-to-tray. Desktop unit tests
  // share the developer profile and must not unlink it.
  if (!isDesktopTestMode()) {
    for (const dir of tmpDirCandidates()) {
      try {
        const commandPath = path.join(dir, 'tray-command.json');
        if (fs.existsSync(commandPath)) fs.unlinkSync(commandPath);
      } catch {
        // ignore
      }
    }
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

function trayCommandCandidatePaths() {
  const paths = [];
  const push = (filePath) => {
    if (!filePath || paths.includes(filePath)) return;
    paths.push(filePath);
  };
  try {
    push(trayCommandPath());
  } catch {
    // ignore
  }
  // Unit tests must not read a show request out of the developer profile.
  if (!isDesktopTestMode()) {
    for (const dir of tmpDirCandidates()) {
      push(path.join(dir, 'tray-command.json'));
    }
  }
  return paths;
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
  secondInstanceBound: false,
  commandPoll: null,
  windowPolls: [],
  lastCommandTs: null,
  mainAppWindow: null,
  stopped: false,
  pendingTimers: [],
  autoLaunch: null,
  userRevealedWindow: false,
  macLoginItemsDeferred: false,
  macLoginItemCleanupStarted: false,
  macLoginItemsReady: false,
  macPreferenceBeforeLoginItems: null,
  autostartUserSet: false,
  loginItemPromptDismissed: false,
  macAutostartChain: Promise.resolve(),
  loginItemExplainPromise: null,
};

const osx = os.platform() === 'darwin';
const linux = os.platform() === 'linux';

function hasNw() {
  return typeof nw !== 'undefined' && !!nw?.Window;
}

/**
 * Hidden autostart must not call System Events. Login Item cleanup waits
 * until the user has opened the window and seen why macOS will ask.
 */
function shouldDeferMacLoginItems(platform, hiddenLaunch, userRevealed) {
  return platform === 'darwin' && !!hiddenLaunch && !userRevealed;
}

/**
 * After the note, delete leftover Login Items. Migrate them into the
 * LaunchAgent only when autostart is still wanted and no agent exists yet.
 * A stored "off", or a checkbox change during the note, must not be undone.
 */
function macLoginItemFollowUp(userSet, preferenceOn, agentEnabled) {
  if (userSet || agentEnabled || !preferenceOn) return 'remove-items';
  return 'migrate';
}

function loginItemAccessExplained() {
  try {
    return localStorage.getItem(LOGIN_ITEM_EXPLAINED_KEY) === '1';
  } catch {
    return false;
  }
}

function markLoginItemAccessExplained() {
  try {
    localStorage.setItem(LOGIN_ITEM_EXPLAINED_KEY, '1');
  } catch {
    // ignore
  }
}

function loginItemAppleScriptDeferred() {
  return osx && !state.macLoginItemsReady;
}

function enqueueMacAutostart(task) {
  const run = state.macAutostartChain.then(task, task);
  state.macAutostartChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function presentLoginItemAccessDialog() {
  return new Promise((resolve) => {
    const show = () => {
      if (loginItemAccessExplained()) {
        resolve(true);
        return;
      }
      if (!document.body) {
        resolve(false);
        return;
      }
      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-labelledby', 'onlykey-login-item-title');
      overlay.setAttribute('data-testid', 'login-item-access-dialog');
      overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:400',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:16px',
        'background:rgba(0,0,0,0.7)',
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
      ].join(';');

      const card = document.createElement('div');
      card.style.cssText = [
        'width:100%',
        'max-width:28rem',
        'background:var(--ok-surface,#2d2d2d)',
        'color:var(--ok-text,#fff)',
        'border:1px solid var(--ok-border,rgba(255,255,255,0.1))',
        'border-radius:16px',
        'padding:24px',
        'box-shadow:0 25px 50px rgba(0,0,0,0.45)',
      ].join(';');

      const title = document.createElement('h2');
      title.id = 'onlykey-login-item-title';
      title.textContent = 'Allow System Events';
      title.style.cssText = 'margin:0 0 12px;font-size:20px;font-weight:700';

      const lead = document.createElement('p');
      lead.textContent = 'macOS will ask OnlyKey to control System Events. Choose Allow.';
      lead.style.cssText = 'margin:0 0 8px;font-size:14px;line-height:1.5;color:var(--ok-text-secondary,#d1d5db)';

      const detail = document.createElement('p');
      detail.textContent = LOGIN_ITEM_ACCESS_DETAIL;
      detail.style.cssText = 'margin:0;font-size:14px;line-height:1.5;color:var(--ok-text-muted,#a8b0bc)';

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;justify-content:flex-end;gap:12px;margin-top:20px';

      const later = document.createElement('button');
      later.type = 'button';
      later.textContent = 'Not now';
      later.style.cssText = [
        'background:transparent',
        'color:var(--ok-text,#fff)',
        'border:0',
        'border-radius:12px',
        'padding:10px 20px',
        'font-weight:600',
        'cursor:pointer',
      ].join(';');
      later.addEventListener('click', () => {
        state.loginItemPromptDismissed = true;
        overlay.remove();
        resolve('later');
      });

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Continue';
      button.style.cssText = [
        'background:#0056b3',
        'color:#fff',
        'border:0',
        'border-radius:12px',
        'padding:10px 20px',
        'font-weight:700',
        'cursor:pointer',
      ].join(';');
      button.addEventListener('click', () => {
        overlay.remove();
        resolve(true);
      });

      actions.append(later, button);
      card.append(title, lead, detail, actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      try {
        const win = nw.Window.get();
        if (win && win.isVisible) button.focus();
      } catch {
        // ignore
      }
    };

    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }
    if (document.body) {
      show();
      return;
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', show, { once: true });
      return;
    }
    resolve(false);
  });
}

/** Resolves true when it is safe to call System Events. */
function explainLoginItemAccess() {
  if (!osx || isDesktopTestMode()) return Promise.resolve(false);
  if (loginItemAccessExplained()) return Promise.resolve(true);
  if (state.loginItemExplainPromise) return state.loginItemExplainPromise;
  const pending = presentLoginItemAccessDialog().then((shown) => {
    if (!shown) state.loginItemExplainPromise = null;
    return shown;
  });
  state.loginItemExplainPromise = pending;
  return pending;
}

async function finishMacLoginItemAccess() {
  let proceed = false;
  try {
    const answer = await explainLoginItemAccess();
    if (answer === 'later') {
      state.loginItemPromptDismissed = true;
      state.macLoginItemCleanupStarted = false;
      return;
    }
    if (answer !== true) {
      state.macLoginItemCleanupStarted = false;
      return;
    }
    proceed = true;
    if (state.stopped || !state.autoLaunch) return;
    const followUp = macLoginItemFollowUp(
      state.autostartUserSet,
      state.macPreferenceBeforeLoginItems === true,
      await state.autoLaunch.isEnabled(),
    );
    if (followUp === 'remove-items') {
      await state.autoLaunch.removeLegacyLoginItems();
      return;
    }
    const result = await state.autoLaunch.repair();
    if (state.autostartUserSet) return;
    userPreferences.autoLaunch = !!result.enabled;
    if (state.tray) assignTrayMenu(buildTrayMenu(state.autoLaunch));
  } catch (error) {
    console.error('Login item cleanup failed:', error);
  } finally {
    if (!proceed) return;
    markLoginItemAccessExplained();
    state.macLoginItemsReady = true;
  }
}

function scheduleMacLoginItemCleanup() {
  if (!osx || isDesktopTestMode() || state.loginItemPromptDismissed) return;
  if (state.macLoginItemCleanupStarted) return;
  if (!state.autoLaunch) return;
  if (state.macLoginItemsDeferred && !state.userRevealedWindow) return;
  state.macLoginItemCleanupStarted = true;
  enqueueMacAutostart(() => finishMacLoginItemAccess());
}

function trayInitActive() {
  return !state.stopped && hasNw();
}

function runLater(fn, delayMs) {
  const id = setTimeout(() => {
    state.pendingTimers = state.pendingTimers.filter((timer) => timer !== id);
    if (!trayInitActive()) return;
    fn();
  }, delayMs);
  state.pendingTimers.push(id);
  return id;
}

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
  if (pageHref.includes('_generated_background_page')) return true;
  if (!pageHref && !isMainAppWindow(nwWin)) return true;
  return !isMainAppWindow(nwWin);
}

function isTrayHostWindow(win) {
  if (!win) return false;
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
  const roots = [resolveAppRoot(), __dirname];
  try {
    if (typeof nw !== 'undefined' && nw.App && nw.App.startPath) {
      roots.push(nw.App.startPath);
    }
  } catch {
    // ignore
  }

  const candidates = [];
  for (const root of roots) {
    if (!root) continue;
    candidates.push(path.join(root, 'resources', 'ok-tray-logo.png'));
    candidates.push(path.join(root, 'ok-tray-logo.png'));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate.replace(/\\/g, '/');
    }
  }

  throw new Error(`Tray icon missing under ${resolveAppRoot()}`);
}

function revealWindow(win) {
  state.userRevealedWindow = true;
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
  scheduleMacLoginItemCleanup();
}

function executeShowMainWindow() {
  const reveal = () => {
    if (state.quitting || state.stopped || !hasNw()) return;
    state.quitting = false;
    state.userRevealedWindow = true;
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
  };

  reveal();
  // A window that was hidden to the tray sometimes ignores the first show
  // until a later turn of the event loop.
  for (const delayMs of [50, 300]) {
    const id = setTimeout(() => {
      state.pendingTimers = state.pendingTimers.filter((timer) => timer !== id);
      reveal();
    }, delayMs);
    state.pendingTimers.push(id);
  }
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

function readPendingTrayCommand() {
  for (const commandPath of trayCommandCandidatePaths()) {
    try {
      if (!fs.existsSync(commandPath)) continue;
      const payload = JSON.parse(fs.readFileSync(commandPath, 'utf8'));
      return { commandPath, payload };
    } catch {
      // try the next location
    }
  }
  return null;
}

function pollTrayCommands() {
  // Only the main renderer runs start() and owns mainAppWindow.
  if (!state.mainStarted || !hasNw()) return;

  const pending = readPendingTrayCommand();
  if (!pending?.payload?.command || String(pending.payload.ts) === state.lastCommandTs) return;

  state.lastCommandTs = String(pending.payload.ts);
  try {
    fs.unlinkSync(pending.commandPath);
  } catch {
    // ignore
  }

  processTrayCommand(pending.payload.command);
}

function showMainWindow() {
  dispatchTrayCommand('show');
}

function collectArgv() {
  const values = [];
  const pushAll = (list) => {
    if (!list || typeof list[Symbol.iterator] !== 'function') return;
    for (const item of list) values.push(String(item));
  };
  try {
    pushAll(nw.App.argv);
  } catch {
    // ignore
  }
  try {
    pushAll(nw.App.fullArgv);
  } catch {
    // ignore
  }
  try {
    pushAll(process.argv);
  } catch {
    // ignore
  }
  return values;
}

function hasHiddenLaunchArg(arg) {
  return arg === '--hidden' || arg === '--onlykey-autostart' || arg.startsWith('--hidden=');
}

/** True when this process was started by the OS login entry. */
function launchedHiddenToTray() {
  try {
    if (process.env.ONLYKEY_LAUNCHED_HIDDEN === '1') return true;
  } catch {
    // ignore
  }
  return collectArgv().some(hasHiddenLaunchArg);
}

function isHiddenLaunchCommand(cmdline) {
  const line = Array.isArray(cmdline) ? cmdline.map(String).join(' ') : String(cmdline || '');
  return /(?:^|[\s"'=])--(?:hidden|onlykey-autostart)(?:\s|"|'|=|$)/.test(line);
}

function localSuppressShow() {
  try {
    return localStorage.getItem(SUPPRESS_SHOW_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Autostart must not paint the window, including when a focus event arrives
 * before the suppress flag is put back. After the user asks for the window,
 * only an explicit hide-to-tray keeps it hidden.
 */
function shouldKeepWindowHidden() {
  if (state.userRevealedWindow) return readSuppressShow() || localSuppressShow();
  if (launchedHiddenToTray()) return true;
  return readSuppressShow() || localSuppressShow();
}

/**
 * Autostart-to-tray: keep the window off-screen and off the taskbar.
 * Returns true when this launch should stay in the tray.
 */
function applyLaunchVisibility(win) {
  if (!launchedHiddenToTray()) return false;
  state.userRevealedWindow = false;
  setSuppressShow(true);
  if (!win) return true;
  try {
    if (typeof win.setShowInTaskbar === 'function') win.setShowInTaskbar(false);
  } catch {
    // ignore
  }
  try {
    win.hide();
  } catch {
    // ignore
  }
  return true;
}

function bindAppEvent(event, handler) {
  try {
    nw.App.on(event, handler);
    return true;
  } catch (error) {
    if (event === 'open') console.error('nw.App.on(open) failed:', error);
    return false;
  }
}

function rebindAppEvent(event, handler) {
  // Some NW.js builds drop the open listener after a single dispatch.
  // Re-add it so the next Start menu / Dock / CLI launch still restores.
  try {
    if (typeof nw.App.removeListener !== 'function') return;
    nw.App.removeListener(event, handler);
  } catch {
    return;
  }
  bindAppEvent(event, handler);
}

/**
 * Chromium single-instance: a second launch (Start menu, Dock, Applications,
 * taskbar pin, or the executable itself) does not start a new process. It
 * prints "Opening in existing browser session" and exits. App.on('open') is
 * that signal on Windows and Linux. App.on('reopen') is the macOS dock click.
 * A --hidden autostart while we are already running must stay in the tray.
 */
function bindSecondInstanceShow() {
  if (state.secondInstanceBound) return;
  state.secondInstanceBound = true;

  const onSecondLaunch = (cmdline) => {
    const line = Array.isArray(cmdline) ? cmdline.map(String).join(' ') : String(cmdline || '');
    trayLog('second-instance launch', { cmdline: line });
    rebindAppEvent('open', onSecondLaunch);
    rebindAppEvent('reopen', onSecondLaunch);
    if (isHiddenLaunchCommand(line)) {
      trayLog('second-instance hidden autostart — stay in tray');
      return;
    }
    try {
      executeShowMainWindow();
    } catch (error) {
      console.error('second-instance show failed:', error);
    }
  };

  bindAppEvent('open', onSecondLaunch);
  // macOS: click the dock icon, or open the app from Finder, while running.
  bindAppEvent('reopen', onSecondLaunch);
}

function quitApp() {
  dispatchTrayCommand('quit');
}

function bindWindowCloseHandler(win) {
  if (!win || win._onlykeyCloseBound) return;
  win._onlykeyCloseBound = true;

  // NW.js passes 'quit' when the close comes from the app quitting rather than
  // the window's close button: Cmd+Q, Quit in the Dock menu, and macOS logging
  // out, restarting or shutting down. Hiding to the tray then cancels the quit,
  // and macOS reports "OnlyKey App failed to quit" and stops the restart.
  win.on('close', function onClose(why) {
    if (state.quitting) {
      this.close(true);
      return;
    }

    if (why === 'quit') {
      executeQuitApp();
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
  if (!hasNw()) return;
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

/**
 * Linux StatusNotifier/AppIndicator (Cinnamon/Mint/GNOME): mutating an assigned
 * tray menu with remove()/insert() often leaves an EMPTY right-click menu.
 * Always build a fresh Menu and reassign tray.menu instead.
 */
function refreshTrayMenu() {
  if (!state.tray) return;
  assignTrayMenu(buildTrayMenu(state.autoLaunch));
}

function assignTrayMenu(menu) {
  state.menu = menu;
  if (!state.tray) return;
  try {
    // Some NW/Linux builds only refresh when the property is replaced.
    state.tray.menu = menu;
  } catch (error) {
    console.error('assignTrayMenu failed:', error);
  }
}

function buildTrayMenu(autoLaunch) {
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
    label: 'Autostart to tray',
    type: 'checkbox',
    checked: !!userPreferences.autoLaunch,
    click: function () {
      if (!autoLaunch) {
        // Keep checkbox in sync with reality when autostart is unavailable.
        autoLaunchMenuItem.checked = false;
        userPreferences.autoLaunch = false;
        return;
      }
      const next = !userPreferences.autoLaunch;
      state.autostartUserSet = true;
      enqueueMacAutostart(() => {
        const autostartOptions = loginItemAppleScriptDeferred() ? { skipLoginItems: true } : undefined;
        const op = next ? autoLaunch.enable(autostartOptions) : autoLaunch.disable(autostartOptions);
        return op
          .catch(console.error)
          .then(() => autoLaunch.isEnabled())
          .then((enabled) => {
            userPreferences.autoLaunch = !!enabled;
          })
          .catch(() => {
            userPreferences.autoLaunch = next;
          })
          .finally(() => {
            // Rebuild so Linux tray picks up the new checked state.
            assignTrayMenu(buildTrayMenu(autoLaunch));
          });
      });
    },
  });

  const autoUpdateMenuItem = new nw.MenuItem({
    label: 'Automatically check for app updates',
    type: 'checkbox',
    checked: !!userPreferences.autoUpdate,
    click: function () {
      userPreferences.autoUpdate = !userPreferences.autoUpdate;
      assignTrayMenu(buildTrayMenu(autoLaunch));
    },
  });

  const autoUpdateFWMenuItem = new nw.MenuItem({
    label: 'Automatically check for firmware updates',
    type: 'checkbox',
    checked: !!userPreferences.autoUpdateFW,
    click: function () {
      userPreferences.autoUpdateFW = !userPreferences.autoUpdateFW;
      assignTrayMenu(buildTrayMenu(autoLaunch));
    },
  });

  const closeToTrayMenuItem = new nw.MenuItem({
    label: 'Hide to system tray when window is closed',
    type: 'checkbox',
    checked: !!userPreferences.closeToTray,
    click: function () {
      userPreferences.closeToTray = !userPreferences.closeToTray;
      assignTrayMenu(buildTrayMenu(autoLaunch));
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
    'Autostart to tray',
    'Automatically check for app updates',
    'Automatically check for firmware updates',
    'Hide to system tray when window is closed',
    'Quit OnlyKey App',
  ];

  return settingsMenu;
}

/**
 * macOS: the path a login entry must launch.
 *
 * process.execPath in NW.js's node context is a Chromium HELPER, not the app:
 * …/OnlyKey App.app/Contents/Frameworks/nwjs Framework.framework/Versions/<v>/
 * Helpers/nwjs Helper (Renderer).app/Contents/MacOS/nwjs Helper (Renderer).
 * Login autostart does not launch that helper. It `open`s the outer bundle.
 * This resolves the bundle's own executable (Contents/MacOS/<CFBundleExecutable>).
 */
function macBundleRoot(execPath) {
  const match = /^(.+?\.app)(?:\/|$)/.exec(String(execPath || ''));
  return match ? match[1] : null;
}

function macLaunchPath(execPath) {
  const root = macBundleRoot(execPath);
  if (!root) return execPath;
  const dir = path.join(root, 'Contents', 'MacOS');
  try {
    const names = fs.readdirSync(dir).filter((name) => !name.startsWith('.'));
    const own = path.basename(root, '.app');
    if (names.includes(own)) return path.join(dir, own);
    if (names.length) return path.join(dir, names[0]);
  } catch {
    // fall through
  }
  return execPath;
}

/**
 * Remove LaunchAgents an earlier 6.0.0 build wrote for one of this bundle's
 * helpers ("nwjs Helper (Renderer).plist"). Returns true when one was removed,
 * i.e. the user had autostart on and it never worked.
 */
function removeHelperLaunchAgents(execPath) {
  const root = macBundleRoot(execPath);
  if (!root) return false;
  const dir = path.join(os.homedir(), 'Library', 'LaunchAgents');
  let removed = false;
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith('.plist'));
  } catch {
    return false;
  }
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      const text = fs.readFileSync(file, 'utf8');
      if (text.includes(`${root}/Contents/Frameworks/`)) {
        fs.unlinkSync(file);
        removed = true;
        trayLog('removed helper LaunchAgent', { file });
      }
    } catch (error) {
      console.error('Could not check LaunchAgent', file, error);
    }
  }
  return removed;
}

async function initTray() {
  if (state.tray || !trayInitActive()) return;

  const appPath = process.execPath;
  let autoLaunch = null;
  try {
    autoLaunch = createLoginAutostart({
      execPath: appPath,
      allowWrites: !isDesktopTestMode(),
    });
  } catch (error) {
    console.error('Autostart init skipped:', error);
  }

  // Resolve OS autostart state BEFORE first menu paint. Doing it afterward and
  // calling remove()/insert() emptied the Linux tray menu (Cinnamon/Mint).
  // Desktop unit tests must not read or write the developer machine's login items.
  // On Mac the note and System Events call happen after the tray exists, so
  // closing the window before Continue still leaves a tray icon.
  const deferMacLoginItems = shouldDeferMacLoginItems(
    os.platform(),
    launchedHiddenToTray(),
    state.userRevealedWindow,
  );
  if (autoLaunch && !isDesktopTestMode()) {
    try {
      if (osx) {
        state.macLoginItemsDeferred = deferMacLoginItems;
        if (state.macPreferenceBeforeLoginItems == null && !state.autostartUserSet) {
          state.macPreferenceBeforeLoginItems = !!userPreferences.autoLaunch;
        }
      }
      await autoLaunch.repair(osx ? { skipLoginItems: true } : undefined);
      if (!trayInitActive()) return;
      const enabled = !!(await autoLaunch.isEnabled());
      if (!trayInitActive()) return;
      // Keep a stored "on" until the visible-window pass can see Login Items.
      // Persisting "off" here would skip that migration if the note is dismissed.
      const mayMigrate = osx && !enabled && state.macPreferenceBeforeLoginItems === true && !state.autostartUserSet;
      if (!mayMigrate) userPreferences.autoLaunch = enabled;
    } catch (error) {
      console.error('Autostart repair failed:', error);
    }
  }

  if (!trayInitActive()) return;

  state.autoLaunch = autoLaunch;
  const settingsMenu = buildTrayMenu(autoLaunch);
  const iconPath = resolveTrayIconPath();
  const trayOptions = { icon: iconPath };
  if (linux) trayOptions.title = 'OnlyKey';
  if (osx) trayOptions.iconsAreTemplates = false;
  const tray = new nw.Tray(trayOptions);
  state.tray = tray;
  if (!linux) tray.tooltip = 'OnlyKey Configuration App settings';

  if (!osx) {
    tray.on('click', () => {
      trayLog('tray icon click');
      dispatchTrayCommand('show');
    });
  }

  assignTrayMenu(settingsMenu);
  trayLog('initTray complete', { iconPath, menuItems: state.menuLabels.length });
  markTrayReady(true);
  scheduleMacLoginItemCleanup();

  // Re-assign once more on next tick — some Linux tray hosts register the icon
  // asynchronously and drop the first menu attachment.
  if (linux) {
    runLater(() => {
      if (state.tray && state.menu) {
        assignTrayMenu(state.menu);
        trayLog('linux tray menu reassigned');
      }
    }, 250);
  }
}

function startCommandPolling() {
  if (state.commandPoll) return;
  state.commandPoll = setInterval(pollTrayCommands, 50);
}

/** Background-context entry used by unit tests. Production boots via start(). */
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
  state.stopped = false;
  trayLog('startBackground', {
    nwGetHref: windowHref(nwWin),
    pageHref,
    isBackgroundPage: isBackgroundPageContext(nwWin),
  });

  markTrayReady(false);

  const launchTray = (attempt) => {
    if (!trayInitActive()) return;
    initTray().catch((error) => {
      if (!trayInitActive()) return;
      console.error(`Tray init failed in background (attempt ${attempt}):`, error);
      markTrayReady(false);
      if (attempt < 5) {
        runLater(() => launchTray(attempt + 1), 1000);
      }
    });
  };
  launchTray(1);

  attachToAppWindows();
  startWindowPoll(() => attachToAppWindows(), 40);
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
  if (!trayInitActive() || ownsTray()) return;
  initTray().catch((error) => {
    if (!trayInitActive()) return;
    console.error(`Tray init failed in main window (attempt ${attempt}):`, error);
    markTrayReady(false);
    if (attempt < 5) {
      runLater(() => launchTrayInMain(attempt + 1), 1000);
    }
  });
}

/** Main window entry — tray, close handler, command polling (nw-tray-example pattern). */
function start() {
  if (state.mainStarted) return;
  state.mainStarted = true;
  state.stopped = false;

  const hiddenLaunch = launchedHiddenToTray();
  clearTrayArtifacts();

  const mainWin = nw.Window.get();
  state.mainAppWindow = mainWin;
  // clearTrayArtifacts drops suppress-show. Put it back before any focus
  // handler can paint the window for an autostart-to-tray launch.
  if (hiddenLaunch) applyLaunchVisibility(mainWin);
  writeMainWindowMarker(mainWin);
  trayLog('start main window', { href: windowHref(mainWin), hiddenLaunch });

  bindWindowCloseHandler(mainWin);
  bindSecondInstanceShow();
  attachToAppWindows();
  startCommandPolling();

  if (!state.backgroundStarted) {
    launchTrayInMain(1);
  }

  startWindowPoll(() => {
    bindWindowCloseHandler(nw.Window.get());
    attachToAppWindows();
  }, 20);
}

function startWindowPoll(tick, maxPolls) {
  let polls = 0;
  const poll = setInterval(() => {
    if (!hasNw()) {
      clearInterval(poll);
      return;
    }
    tick();
    polls += 1;
    if (polls >= maxPolls) clearInterval(poll);
  }, 500);
  state.windowPolls.push(poll);
}

function stop() {
  state.stopped = true;
  if (state.commandPoll) {
    clearInterval(state.commandPoll);
    state.commandPoll = null;
  }
  for (const poll of state.windowPolls) clearInterval(poll);
  state.windowPolls = [];
  for (const id of state.pendingTimers) clearTimeout(id);
  state.pendingTimers = [];
}

function getTestState() {
  let iconPath;
  try {
    iconPath = resolveTrayIconPath();
  } catch {
    iconPath = path.join(resolveAppRoot(), 'resources', 'ok-tray-logo.png');
  }
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
  stop,
  clearTrayArtifacts,
  showMainWindow,
  quitApp,
  launchedHiddenToTray,
  shouldDeferMacLoginItems,
  macLoginItemFollowUp,
  shouldKeepWindowHidden,
  applyLaunchVisibility,
  dispatchTrayCommand,
  processTrayCommand,
  bindWindowCloseHandler,
  macBundleRoot,
  macLaunchPath,
  removeHelperLaunchAgents,
  readCloseToTray,
  readSuppressShow,
  setSuppressShow,
  refreshTrayMenu,
  isTrayReadyInBackground,
  isTrayReadyOnDisk,
  getTestState,
  resolveAppRoot,
  _state: state,
};
