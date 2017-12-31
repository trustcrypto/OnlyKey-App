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

            const AutoLaunch = require('auto-launch');
            const autoLaunch = new AutoLaunch({
                name: 'OnlyKey'
            });

            const enableAutoLaunch = localStorage.autoLaunch === 'true';
            autoLaunch.isEnabled()
                .then(isEnabled => {
                    if (isEnabled && !enableAutoLaunch) {
                        autoLaunch.disable();
                    } else if(!isEnabled && enableAutoLaunch) {
                        autoLaunch.enable();
                    }
                })
                .catch(console.error);
        },
        type: 'checkbox',
        checked: localStorage.autoLaunch === 'true'
    }));

    settingsMenu.append(new nw.MenuItem({
        label: 'Check for updates on app start',
        click: function() {
            localStorage.autoUpdate = localStorage.autoUpdate === 'true' ? 'false' : 'true';
            console.info(`Toggled autoUpdate to ${localStorage.autoUpdate}`);
        },
        type: 'checkbox',
        checked: localStorage.autoUpdate === 'true'
    }));

    menubar.append(new nw.MenuItem({
        label: 'Settings',
        submenu: settingsMenu
    }));

    win.menu = menubar;
})();
