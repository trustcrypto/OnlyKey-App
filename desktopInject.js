// Injected into the main window at document-start (package.json inject_js_start).
(function () {
  if (typeof nw === 'undefined') return;

  var win = nw.Window.get();
  if (!win) return;

  var showWin = function () {
    try {
      if (localStorage.getItem('onlykeySuppressShow') === '1') return;
      var fs = require('fs');
      var path = require('path');
      if (fs.existsSync(path.join(nw.App.startPath, 'tmp', 'suppress-show.json'))) return;
    } catch (error) {}
    if (win.isMinimized && win.restore) win.restore();
    if (!win.isVisible) win.show(true);
    win.focus();
  };

  showWin();
  win.on('focus', showWin);
  win.on('restore', showWin);

  try {
    var desktop = require('./desktopBg.cjs');
    if (typeof desktop.start === 'function') desktop.start();
  } catch (error) {
    try {
      var path = require('path');
      var desktop = require(path.join(nw.App.startPath, 'desktopBg.cjs'));
      if (typeof desktop.start === 'function') desktop.start();
    } catch (error2) {
      console.error('Desktop bootstrap failed:', error2);
    }
  }
})();