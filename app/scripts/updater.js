(function() {
    'use strict';

    if (localStorage.autoUpdate === 'false') return;

    let manifest;

    try {
        manifest = require('./manifest.json');
    } catch (e) {
        manifest = require('../manifest.json');
    }

    const AutoUpdater = require('nw-autoupdater'),
          updater = new AutoUpdater(manifest),
          appUpdaterUi = document.querySelector('#appUpdater'),
          appVersionUi = document.querySelector('#appVersion');

    async function main() {
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
            if (!confirm(`Version ${rManifest.version} is available. Do you want to upgrade?`)) {
                return;
            }

            // Subscribe for progress events
            updater.on("download", (downloadSize, totalSize) => {
                const progress = Math.floor(downloadSize / totalSize * 100) + "%";
                appUpdaterUi.innerHTML = `Downloading...${progress}`;
            });
            updater.on("install", (installFiles, totalFiles) => {
                const progress = Math.floor(installFiles / totalFiles * 100) + "%";
                appUpdaterUi.innerHTML = `Installing...${progress}`;
            });

            const updateFile = await updater.download(rManifest);
            await updater.unpack(updateFile);
            alert(`The application will automatically restart to finish installing the update`);
            await updater.restartToSwap();
        } catch (e) {
            console.error(e);
        }
    }

    appVersionUi.innerHTML = `v${nw.App.manifest.version}\n`;

    main();
})();
