'use strict';

/**
 * NW.js bg-script entry — official background page for tray + menu.
 * See https://docs.nwjs.io/References/Tray/ and docs/desktop-tray.md
 */
const fs = require('fs');
const path = require('path');

function appendBootLog(message, data) {
  try {
    const root = typeof nw !== 'undefined' ? nw.App.startPath : path.dirname(__filename);
    const logPath = path.join(root, 'tmp', 'tray-debug.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify({ ts: Date.now(), message, data: data ?? null })}\n`);
  } catch {
    // ignore
  }
}

function launchTray(attempt) {
  if (typeof nw === 'undefined') {
    if (attempt < 200) {
      setTimeout(() => launchTray(attempt + 1), 50);
      return;
    }
    appendBootLog('bg-script gave up waiting for nw', { attempt });
    return;
  }

  try {
    const desktop = require(path.join(nw.App.startPath, 'desktopBg.cjs'));
    desktop.startBackground();
    appendBootLog('bg-script launched startBackground', { attempt });
  } catch (error) {
    appendBootLog('bg-script startBackground failed', { attempt, error: String(error) });
    if (attempt < 20) {
      setTimeout(() => launchTray(attempt + 1), 250);
    }
  }
}

launchTray(0);