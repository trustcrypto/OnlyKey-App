(function() {
    'use strict';

    if (typeof nw == 'undefined') return;

    let props = {
        // title: 'OK',
        icon: 'images/onlykey_logo_128.png',
    };

    if (process.platform === 'darwin') {
        props.icon = 'images/onlykey_logo_32.png';
        // delete props.icon;
    }

    const tray = new nw.Tray(props);

    const menu = new nw.Menu();
    menu.append(new nw.MenuItem({ type: 'checkbox', label: 'Option1' }));
    tray.menu = menu;
})();
