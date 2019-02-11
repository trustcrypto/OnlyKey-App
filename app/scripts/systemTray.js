(function() {
    'use strict';

    if (typeof nw == 'undefined') return;

    let props = {
        title: 'OK',
        icon: 'images/onlykey_logo_32.png',
        tooltip: 'OnlyKey App is running',
    };

    if (process.platform === 'darwin') {
        delete props.title;
    }

    const tray = new nw.Tray(props);

    const menu = new nw.Menu();
    menu.append(new nw.MenuItem({ type: 'checkbox', label: 'Option1' }));
    tray.menu = menu;
})();
