// Create default menu items for OSX

(function() {
'use strict';

if (typeof nw == 'undefined') return;

if (process.platform === 'darwin') {
  let gui = require('nw.gui');
  let win = gui.Window.get();

  let mb = new gui.Menu({type: 'menubar'});
  mb.createMacBuiltin(gui.App.manifest.productName);
  win.menu = mb;
}
}());
