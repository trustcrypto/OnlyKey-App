declare const nw: any;

type NwWindow = {
  isVisible: boolean;
  isMinimized?: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  _onlykeySuppressShow?: boolean;
  _onlykeyCloseBound?: boolean;
  show: (focus?: boolean) => void;
  focus: () => void;
  restore?: () => void;
  moveTo: (x: number, y: number) => void;
  on: (event: string, callback: () => void) => void;
  hide: () => void;
};

export function isDevRuntime(): boolean {
  if (process.argv.includes('--onlykey-dev')) return true;
  return process.execPath.replace(/\\/g, '/').includes('node_modules/nw');
}

function isSuppressShow(_win: NwWindow): boolean {
  try {
    if (localStorage.getItem('onlykeySuppressShow') === '1') return true;
  } catch {
    // ignore
  }
  try {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    return fs.existsSync(path.join(nw.App.startPath, 'tmp', 'suppress-show.json'));
  } catch {
    return false;
  }
}

export function ensureWindowVisible(win: NwWindow): void {
  if (isSuppressShow(win)) return;
  if (win.isMinimized && win.restore) win.restore();
  if (!win.isVisible) win.show(true);
  win.focus();
}

export function centerWindowOnScreen(win: NwWindow): void {
  const screens = nw.Screen?.screens;
  if (!screens?.length) return;

  const primary = screens.find((screen: { isBuiltIn?: boolean }) => screen.isBuiltIn) ?? screens[0];
  const bounds = primary.bounds ?? primary.work_area;
  if (!bounds) return;

  const x = Math.round(bounds.x + (bounds.width - win.width) / 2);
  const y = Math.round(bounds.y + (bounds.height - win.height) / 2);
  win.moveTo(x, y);
}

export function bindWindowVisibilityHandlers(win: NwWindow): void {
  ensureWindowVisible(win);
  centerWindowOnScreen(win);

  win.on('loaded', () => {
    ensureWindowVisible(win);
    centerWindowOnScreen(win);
  });
  win.on('focus', () => ensureWindowVisible(win));
  win.on('restore', () => ensureWindowVisible(win));
}

export function bindCloseToTrayOrQuit(win: NwWindow): void {
  // Registered from index.html before React loads; keep as a fallback only.
  if ((win as { _onlykeyCloseBound?: boolean })._onlykeyCloseBound) return;
  (win as { _onlykeyCloseBound?: boolean })._onlykeyCloseBound = true;

  win.on('close', () => {
    if (isDevRuntime()) {
      nw.App.quit();
      return;
    }
    try {
      localStorage.setItem('onlykeySuppressShow', '1');
    } catch {
      // ignore
    }
    win._onlykeySuppressShow = true;
    win.hide();
  });
}