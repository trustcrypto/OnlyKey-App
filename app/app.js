/*jshint esnext: true */

var connectedto = -1;

const SUPPORTED_DEVICES = [
    {
        vendorId: 5824, //OnlyKey firmware before Beta 7
        productId: 1158,
        maxInputReportSize: 64,
        maxOutputReportSize: 64,
        maxFeatureReportSize: 0,
    },
    {
        vendorId: 7504, //OnlyKey firmware Beta 7+ http://www.linux-usb.org/usb.ids
        productId: 24828,
        maxInputReportSize: 64,
        maxOutputReportSize: 64,
        maxFeatureReportSize: 0,
    },
    {
        vendorId: 0000, //Black Vault Labs Bootloaderv1
        productId: 45057,
        maxInputReportSize: 64,
        maxOutputReportSize: 64,
        maxFeatureReportSize: 0,
    },
];

function getSupportedDevice(deviceInfo) {
    let supportedDevice;

    for (let d = 0; d < SUPPORTED_DEVICES.length; d++) {
        let device = SUPPORTED_DEVICES[d];

        const isMatch = Object.keys(device).every(prop => device[prop] == deviceInfo[prop]);
        if (isMatch) {
            supportedDevice = device;
            break;
        }
    }
    return supportedDevice;
}

chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create(
      "app.html", {
        outerBounds: { width: 1024, height: 768 }
      });
});
    
var onDevicesEnumerated = async function (devices) {
  if (chrome.runtime.lastError) {
    console.error("onDevicesEnumerated ERROR:", chrome.runtime.lastError);
    return;
  }

  if (devices && devices.length) {
    console.info("HID devices found:", devices);
    devices.forEach(onDeviceAdded);
    await wait(100);
  }
};

var onDeviceAdded = async function (device) {
    // auto connect desired device
    const supportedDevice = getSupportedDevice(device);
    console.info(device.collections[0].usagePage);
    if (supportedDevice && device.collections[0].usagePage=='65451' && device.serialNumber == '1000000000') {
        chrome.hid.connect(device.deviceId, function (connectInfo) {
            if (chrome.runtime.lastError) {
                console.error("ERROR CONNECTING:", chrome.runtime.lastError);
            } else if (!connectInfo) {
                console.warn("Unable to connect to device.");
            }
            setTime(connectInfo.connectionId);
        });
    } else if (supportedDevice && device.serialNumber != '1000000000') { //Before Beta 8 fw
        console.info("Beta 8+ device not found, looking for old device");
        chrome.hid.connect(device.deviceId, function (connectInfo) {
            if (chrome.runtime.lastError) {
                console.error("ERROR CONNECTING:", chrome.runtime.lastError);
            } else if (!connectInfo) {
                console.warn("Unable to connect to device.");
            }
            setTime(connectInfo.connectionId);
        });
    }
};

// Use a "lite" version of the OnlyKey code to send OKSETTIME messages whenever
// the key is plugged in. This is run by Chrome in the background, and ensures
// that the key knows the correct time for TOTP.
//
// Do not run this when using nwjs.
if (typeof nw == 'undefined') {
    chrome.hid.onDeviceAdded.addListener(onDeviceAdded);

    for (let d = 0; d < SUPPORTED_DEVICES.length; d++) {
        const { vendorId, productId } = SUPPORTED_DEVICES[d];
        const deviceInfo = { vendorId, productId };

        console.log(`Checking for devices with vendorId ${vendorId} and productId ${productId}...`)

        chrome.hid.getDevices(deviceInfo, onDevicesEnumerated);
    }
} else if (!localStorage.hasOwnProperty('autoLaunch')) {
    // default autoLaunch to true if first time running app
    const AutoLaunch = require('auto-launch');
    const appPath = require('./scripts/non-renderer-app-path');
    const appName = appPath.includes('nwjs Helper') ? 'OnlyKey-dev' : 'OnlyKey';
    const userPreferences = require('./scripts/userPreferences.js');
    const os = require('os');
    const osx = os.platform() === 'darwin';
    const autoLaunchOptions = {
        name: appName,
        isHidden: true
    };

    if (osx) {
        autoLaunchOptions.path = appPath;
        autoLaunchOptions.isHidden = false;
    }

    const autoLaunch = new AutoLaunch(autoLaunchOptions);
    autoLaunch.enable();
    userPreferences.autoLaunch = true;
}

function setTime(connectionId) {
    var currentEpochTime = Math.round(new Date().getTime() / 1000.0).toString(16);
    console.info("Setting current epoch time =", currentEpochTime);
    var timeParts = currentEpochTime.match(/.{2}/g);
    var bytesPerMessage = 64;
    var reportId = 0;
    var bytes = new Uint8Array(bytesPerMessage);
    var cursor = 0;
    var messageHeader = [255, 255, 255, 255];

    for (; cursor < messageHeader.length; cursor++) {
        bytes[cursor] = messageHeader[cursor];
    }

    bytes[cursor] = 228;
    cursor++;

    timeParts.forEach(function (val) {
        bytes[cursor++] = hexStrToDec(val);
    });

    var pad = 0;
    for (;cursor < bytes.length;) {
        bytes[cursor++] = pad;
    }

    console.info("SENDING OKSETTIME to connectionId " + connectionId + ":", bytes);

    chrome.hid.send(connectionId, reportId, bytes.buffer, function () {
        if (chrome.runtime.lastError) {
            console.error("ERROR SENDING OKSETTIME:", chrome.runtime.lastError, { connectionId: connectionId });
            callback('ERROR SENDING OKSETTIME PACKETS');
            if (process.platform === 'linux') {
              alert(`Communication failed, follow instructions here when using app on Linux https://docs.crp.to/linux.html`);
            }
        } else {
            console.info("OKSETTIME complete");
            connectedto=connectionId;
        }
    });
}

function hexStrToDec(hexStr) {
    return parseInt(hexStr, 16).toString(10);
}

/**
 * Use promise and setTimeout to wait x seconds
 */
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
