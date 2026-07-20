'use strict';
const fs = require('fs');
const path = require('path');
const root = path.dirname(__filename);
const marker = path.join(root, 'tmp', 'node-main-ran.json');
fs.mkdirSync(path.dirname(marker), { recursive: true });
try {
  if (typeof nw !== 'undefined') {
    const desktop = require(path.join(root, 'desktopBg.cjs'));
    desktop.startBackground();
    setTimeout(function () {
      const state = desktop.getTestState();
      fs.writeFileSync(marker, JSON.stringify({ ts: Date.now(), state }));
    }, 3000);
  } else {
    fs.writeFileSync(marker, JSON.stringify({ ts: Date.now(), error: 'no nw' }));
  }
} catch (e) {
  fs.writeFileSync(marker, JSON.stringify({ ts: Date.now(), error: String(e) }));
}
