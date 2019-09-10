/*jshint esnext: true */
// let usbDetect = ()=>{};
// try {
//   usbDetect = require('usb-detection');
// } catch (error) {
//   console.dir(error);
// }

const OK = require('./scripts/onlyKey/ok');
const retry = require('./scripts/utils/retry');

chrome.app.runtime.onLaunched.addListener(function () {
  chrome.app.window.create(
    "app.html", {
      outerBounds: {
        width: 1024,
        height: 768
      }
    });
});

function okConnect(deviceInfo, retries = 40) {
  const ok = new OK();
  return retry(ok.connect.bind(ok, 0), retries, 250);
}

function listen() {
  // Detect add/insert
  OK.SUPPORTED_DEVICES.forEach(deviceInfo => usbDetect.on(`add:${deviceInfo.vendorId}:${deviceInfo.productId}`, () => okConnect(deviceInfo)));
  usbDetect.startMonitoring();
}

function appInit() {
  // createWindow();
  let connected = !!okConnect(0, 5);
  if (!connected) listen();
}

// Do not run this when using nwjs.
if (typeof nw == 'undefined') {

  for (let d = 0; d < OK.SUPPORTED_DEVICES.length; d++) {
    const {
      vendorId,
      productId
    } = SUPPORTED_DEVICES[d];

    const deviceInfo = {
      vendorId,
      productId
    };

    console.log(`Checking for devices with vendorId ${vendorId} and productId ${productId}...`)

    chrome.hid.getDevices(deviceInfo, devices => {
      let connected = false;
      for (let i = 0; devices && devices.length && i < devices.length && !connected; i++) {
        connected = okConnect(devices[i], 5);
      }
    });
  }
} else {
  const AutoLaunch = require('auto-launch');
  const autoLaunch = new AutoLaunch({
    name: 'OnlyKey',
    isHidden: true
  });

  // read localStorage setting or default to true if first time running app
  const enableAutoLaunch = localStorage.hasOwnProperty('autoLaunch') ? !!localStorage.autoLaunch : localStorage.autoLaunch = true;

  autoLaunch.isEnabled()
    .then(isEnabled => {
      if (isEnabled && !enableAutoLaunch) {
        autoLaunch.disable();
      } else if (!isEnabled && enableAutoLaunch) {
        autoLaunch.enable();
      }
    })
    .catch(console.error);

  appInit();
}
