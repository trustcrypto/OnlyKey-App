import { checkForAppUpdate } from './updater';
import { bindWindowVisibilityHandlers } from './windowVisibility';

function ensureDesktopStarted(): void {
  try {
    const path = require('path') as typeof import('path');
    const desktop = require(path.join(nw.App.startPath, 'desktopBg.cjs')) as {
      start?: () => void;
    };
    desktop.start?.();
  } catch (error) {
    console.error('Desktop start fallback failed:', error);
  }
}

export async function initDesktop(): Promise<void> {
  ensureDesktopStarted();
  const win = nw.Window.get();
  bindWindowVisibilityHandlers(win);
  window.setTimeout(() => {
    ensureDesktopStarted();
    bindWindowVisibilityHandlers(win);
  }, 100);

  checkForAppUpdate().catch(console.error);

  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!target || !target.href) return;
    if (target.href.startsWith('http') && typeof nw !== 'undefined') {
      e.preventDefault();
      nw.Shell.openExternal(target.href);
    }
  });
}