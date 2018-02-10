// Create default menu items for OSX

(function() {
	'use strict';

	if (typeof nw == 'undefined') return;

	if (process.platform === 'darwin') {
		let win = nw.Window.get();

		let mb = new nw.Menu({type: 'menubar'});
		mb.createMacBuiltin(nw.App.manifest.productName);
		win.menu = mb;
	}
}());
