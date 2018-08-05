(function() {
    'use strict';

    if (typeof nw == 'undefined') return;

    const appVersionUi = document.querySelector('#appVersion');
    appVersionUi.innerHTML = `App v${nw.App.manifest.version_name}\n`;
    
    const userPreferences = require('./scripts/userPreferences.js');
    if (!userPreferences.autoUpdate) return;

    checkForAppUpdate();
})();

async function checkForAppUpdate() {
    let manifest;

    try {
        manifest = require('./manifest.json');
    } catch (e) {
        manifest = require('../manifest.json');
    }

    const AutoUpdater = require('nw-autoupdater'),
          updater = new AutoUpdater(manifest),
          appUpdaterUi = document.querySelector('#appUpdater');
    
    try {
         // Update copy is running to replace app with the update
        if (updater.isSwapRequest()) {
            appUpdaterUi.innerHTML += `\nSwapping...`;
            await updater.swap();
            appUpdaterUi.innerHTML += `\nDone updating!`;
            await updater.restart();
            return;
        }

        // Download/unpack update if any available
        const rManifest = await updater.readRemoteManifest();
        const needsUpdate = await updater.checkNewVersion(rManifest);
        if (!needsUpdate) {
            appUpdaterUi.innerHTML += `\nApp is up to date.`;
            setTimeout(() => appUpdaterUi.innerHTML = '', 5000);
            return;
        }
        if (!confirm(`Version ${rManifest.version} is available. Do you want to download the update?`)) {
            return;
        }

        appUpdaterUi.innerHTML = `Downloading ${rManifest.version} ... 0%`;

        // Subscribe for progress events
        updater.on("download", (downloadSize, totalSize) => {
            const progress = Math.floor(downloadSize / totalSize * 100) + "%";
            appUpdaterUi.innerHTML = `Downloading ${rManifest.version} ... ${progress}`;
        });

        updater.on("install", (installFiles, totalFiles) => {
            const progress = Math.floor(installFiles / totalFiles * 100) + "%";
            appUpdaterUi.innerHTML = `Installing ${rManifest.version} ... ${progress}`;
        });

        const updateFile = await updater.download(rManifest);
        appUpdaterUi.innerHTML = `Downloading ${rManifest.version} ... 100%`;
        setTimeout(() => appUpdaterUi.innerHTML = '', 5000);

        // await updater.unpack(updateFile);
        // alert(`The application will automatically restart to finish installing the update`);
        // await updater.restartToSwap();

        // just open an OS file explorer/finder window until installer bugs are fixed
        nw.Shell.showItemInFolder(updateFile);
    } catch (e) {
        appUpdaterUi.innerHTML = '<span style="color: red">App update failed</span>';
        setTimeout(() => appUpdaterUi.innerHTML = '', 5000);
        console.error(e);
    }
}
