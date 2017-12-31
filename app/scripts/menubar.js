(function() {
    'use strict';

    if (typeof nw == 'undefined') return;

    let win = nw.Window.get();

    if (process.platform === 'darwin') {
        let mb = new nw.Menu({type: 'menubar'});
        mb.createMacBuiltin(nw.App.manifest.productName);
        win.menu = mb;
    }

    const menubar = win.menu || new nw.Menu({
        type: 'menubar'
    });

    const settingsMenu = new nw.Menu();

    settingsMenu.append(new nw.MenuItem({
        label: 'Auto-launch app on system login',
        click: function() {
            localStorage.autoLaunch = localStorage.autoLaunch === 'true' ? 'false' : 'true';
            console.info(`Toggled autoLaunch to ${localStorage.autoLaunch}`);

            if (localStorage.autoLaunch !== 'false') {
                // how to disable autoLaunch in OS?
            }
        },
        type: 'checkbox',
        checked: localStorage.autoLaunch !== 'false'
    }));

    settingsMenu.append(new nw.MenuItem({
        label: 'Check for updates on app start',
        click: function() {
            localStorage.autoUpdate = localStorage.autoUpdate === 'true' ? 'false' : 'true';
            console.info(`Toggled autoUpdate to ${localStorage.autoUpdate}`);
        },
        type: 'checkbox',
        checked: localStorage.autoUpdate !== 'false'
    }));

    menubar.append(new nw.MenuItem({
        label: 'Settings',
        submenu: settingsMenu
    }));

    win.menu = menubar;
})();
