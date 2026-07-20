/**
 * Legacy entry point — tray lives in desktopBg.html (bg-script). See docs/desktop-tray.md.
 */
'use strict';

if (typeof nw !== 'undefined') {
  const desktop = require('./desktopBg.cjs');
  if (typeof desktop.start === 'function') desktop.start();
}

module.exports = {};