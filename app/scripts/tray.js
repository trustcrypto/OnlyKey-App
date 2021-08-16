(function() {
  'use strict';

  if (typeof nw == 'undefined') return;

  const userPreferences = require('./scripts/userPreferences.js');
  
  // Create a tray icon
  var tray = new nw.Tray({ icon: './images/ok-tray-logo.png' });

  // begin settings menu
  const settingsMenu = new nw.Menu();

  settingsMenu.append(new nw.MenuItem({
      label: 'Auto-launch app on system login',
      click: function() {
          userPreferences.autoLaunch = !userPreferences.autoLaunch;
          console.info(`Toggled autoLaunch to ${userPreferences.autoLaunch}`);

          const AutoLaunch = require('auto-launch');
          const autoLaunch = new AutoLaunch({
              name: 'OnlyKey',
              isHidden: true,
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
      checked: userPreferences.autoLaunch,
  }));

  settingsMenu.append(new nw.MenuItem({
      label: 'Automatically check for app updates',
      click: function() {
          userPreferences.autoUpdate = !userPreferences.autoUpdate;
          console.info(`Toggled autoUpdate to ${userPreferences.autoUpdate}`);
      },
      type: 'checkbox',
      checked: userPreferences.autoUpdate,
  }));

  settingsMenu.append(new nw.MenuItem({
      label: 'Automatically check for firmware updates',
      click: function() {
          userPreferences.autoUpdateFW = !userPreferences.autoUpdateFW;
          console.info(`Toggled autoUpdateFW to ${userPreferences.autoUpdateFW}`);
      },
      type: 'checkbox',
      checked: userPreferences.autoUpdateFW,
  }));

  // Give it a menu
  tray.menu = settingsMenu;
})();