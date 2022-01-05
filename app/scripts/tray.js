(async function () {
  "use strict";

  if (typeof nw == "undefined") return;

  const userPreferences = require('./scripts/userPreferences.js');
  const settingsMenu = new nw.Menu();
  
  const appPath = require('./scripts/non-renderer-app-path');
  const appName = appPath.includes('nwjs Helper') ? 'OnlyKey-dev' : 'OnlyKey';
  const os = require('os');
  const osx = os.platform() === 'darwin';
  const linux = os.platform() === 'linux';

  const AutoLaunch = require("auto-launch");
  const autoLaunchOptions = {
      name: appName,
      isHidden: true
  };

  if (osx) {
      autoLaunchOptions.path = appPath;
      autoLaunchOptions.isHidden = false;
  }

  const autoLaunch = new AutoLaunch(autoLaunchOptions);
  let autoLaunchEnabledInOSAtLaunch;
  await autoLaunch.isEnabled().then(isEnabled => {
    autoLaunchEnabledInOSAtLaunch = isEnabled;
    userPreferences.autoLaunch = isEnabled;
  });

  const autoLaunchMenuItem = new nw.MenuItem({
    label: 'Auto-launch app on system login',
    click: function () {
      userPreferences.autoLaunch = !userPreferences.autoLaunch;
      console.info(`Toggled autoLaunch to ${userPreferences.autoLaunch}`);
  
      autoLaunch
        .isEnabled()
        .then((isEnabled) => {
          if (isEnabled && !userPreferences.autoLaunch) {
            autoLaunch.disable();
          } else if (!isEnabled && userPreferences.autoLaunch) {
            autoLaunch.enable();
          }
          refreshMenuItem(autoLaunchMenuItem, 0);
        })
        .catch(console.error);
    },
    type: 'checkbox',
    checked: !!autoLaunchEnabledInOSAtLaunch,
  });

  const autoUpdateMenuItem = new nw.MenuItem({
    label: 'Automatically check for app updates',
    click: function () {
      userPreferences.autoUpdate = !userPreferences.autoUpdate;
      console.info(`Toggled autoUpdate to ${userPreferences.autoUpdate}`);
      refreshMenuItem(autoUpdateMenuItem, 1);
    },
    type: 'checkbox',
    checked: userPreferences.autoUpdate,
  });

  const autoUpdateFWMenuItem = new nw.MenuItem({
    label: 'Automatically check for firmware updates',
    click: function () {
      userPreferences.autoUpdateFW = !userPreferences.autoUpdateFW;
      console.info(`Toggled autoUpdateFW to ${userPreferences.autoUpdateFW}`);
      refreshMenuItem(autoUpdateFWMenuItem, 2);
    },
    type: 'checkbox',
    checked: userPreferences.autoUpdateFW,
  });

  const tray = new nw.Tray({
    icon: './images/ok-tray-logo.png',
    tooltip: 'OnlyKey Configuration App settings',
  });

  settingsMenu.append(autoLaunchMenuItem);
  settingsMenu.append(autoUpdateMenuItem);
  settingsMenu.append(autoUpdateFWMenuItem);
  tray.menu = settingsMenu;

  // discovered on linux that the menu item checked state does not live update
  function refreshMenuItem(menuItem, index) {
    if (!linux) return;

    settingsMenu.remove(menuItem);
    settingsMenu.insert(menuItem, index);
    tray.menu = settingsMenu;
  }
})();
