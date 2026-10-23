// Injected into the main window at document-start (package.json inject_js_start).
// package.json window.show is false so an autostart-to-tray launch never flashes
// a window. This script shows the window immediately for every other launch.
(function () {
  if (typeof nw === 'undefined') return;

  var win = nw.Window.get();
  if (!win) return;

  var desktop = null;
  try {
    desktop = require('./desktopBg.cjs');
  } catch {
    try {
      var resolvedPath = require('path');
      desktop = require(resolvedPath.join(nw.App.startPath, 'desktopBg.cjs'));
    } catch (error2) {
      console.error('Desktop bootstrap failed:', error2);
    }
  }

  // Set suppress-show before the first show. start() clears tray files, then
  // applies the hidden launch again.
  if (desktop && typeof desktop.applyLaunchVisibility === 'function') {
    try {
      desktop.applyLaunchVisibility(win);
    } catch {
      // best-effort
    }
  }

  var showWin = function () {
    try {
      if (localStorage.getItem('onlykeySuppressShow') === '1') return;
      var fs = require('fs');
      var path = require('path');
      if (fs.existsSync(path.join(nw.App.startPath, 'tmp', 'suppress-show.json'))) return;
    } catch {
      // suppress-show probe is best-effort
    }
    if (win.isMinimized && win.restore) win.restore();
    if (!win.isVisible) win.show(true);
    win.focus();
  };

  showWin();
  win.on('focus', showWin);
  win.on('restore', showWin);

  if (desktop && typeof desktop.start === 'function') desktop.start();
})();