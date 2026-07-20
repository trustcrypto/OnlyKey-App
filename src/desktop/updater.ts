import { userPreferences } from './userPreferences';

declare const nw: any;
declare const require: NodeRequire;

export async function checkForAppUpdate(): Promise<void> {
  if (typeof nw === 'undefined' || !userPreferences.autoUpdate) return;

  try {
    const path = require('path');
    const pkg = require(path.join(nw.App.startPath, 'package.json'));
    const manifest = {
      name: pkg.name,
      version: pkg.version,
      manifestUrl: pkg.manifestUrl ?? 'https://s3.amazonaws.com/onlykey-app/releases/latest/manifest.json',
    };
    const AutoUpdater = require('nw-autoupdater');
    const updater = new AutoUpdater(manifest);

    if (updater.isSwapRequest()) {
      await updater.swap();
      await updater.restart();
      return;
    }

    const rManifest = await updater.readRemoteManifest();
    const needsUpdate = await updater.checkNewVersion(rManifest);
    if (!needsUpdate) return;

    if (!confirm(`Version ${rManifest.version} is available. Download the update?`)) return;

    updater.on('download', (downloadSize: number, totalSize: number) => {
      const progress = Math.floor((downloadSize / totalSize) * 100);
      console.info(`Downloading update: ${progress}%`);
    });

    const updateFile = await updater.download(rManifest);
    nw.Shell.showItemInFolder(updateFile);
  } catch (e) {
    console.error('App update check failed:', e);
  }
}