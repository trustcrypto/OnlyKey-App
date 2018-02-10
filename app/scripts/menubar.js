(function() {
    'use strict';

    if (typeof nw == 'undefined') return;

    const userPreferences = require('./scripts/userPreferences.js');
    const win = nw.Window.get();
    let menubar;

    if (process.platform === 'darwin') {
        menubar = new nw.Menu({type: 'menubar'});
        menubar.createMacBuiltin(nw.App.manifest.productName);
    }

    if (!menubar) {
        menubar = win.menu && win.menu.type && win.menu.type === 'MenuBar' ? win.menu : new nw.Menu({type: 'menubar'});
    }

    const settingsMenu = new nw.Menu();

    settingsMenu.append(new nw.MenuItem({
        label: 'Auto-launch app on system login',
        click: function() {
            userPreferences.autoLaunch = !userPreferences.autoLaunch;
            console.info(`Toggled autoLaunch to ${userPreferences.autoLaunch}`);

            const AutoLaunch = require('auto-launch');
            const autoLaunch = new AutoLaunch({
                name: 'OnlyKey',
                isHidden: true
            });

            autoLaunch.isEnabled()
                .then(isEnabled => {
                    if (isEnabled && !userPreferences.autoLaunch) {
                        autoLaunch.disable();
                    } else if(!isEnabled && userPreferences.autoLaunch) {
                        autoLaunch.enable();
                    }
                })
                .catch(console.error);
        },
        type: 'checkbox',
        checked: userPreferences.autoLaunch
    }));

    settingsMenu.append(new nw.MenuItem({
        label: 'Check for updates on app start',
        click: function() {
            userPreferences.autoUpdate = !userPreferences.autoUpdate;
            console.info(`Toggled autoUpdate to ${userPreferences.autoUpdate}`);
        },
        type: 'checkbox',
        checked: userPreferences.autoUpdate
    }));

    menubar.append(new nw.MenuItem({
        label: 'Settings',
        submenu: settingsMenu
    }));

    win.menu = menubar;
})();
