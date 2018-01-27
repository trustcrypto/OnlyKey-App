/*jshint esnext: true */
chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create(
      "app.html", {
        outerBounds: { width: 1024, height: 768 }
      });
});

// Use a "lite" version of the OnlyKey code to send OKSETTIME messages whenever
// the key is plugged in. This is run by Chrome in the background, and ensures
// that the key knows the correct time for TOTP.
//
// Do not run this when using nwjs.
if (typeof nw == 'undefined') {
    var onlyKeyLite = new OnlyKeyLite();

    chrome.hid.getDevices(onlyKeyLite.deviceInfo, onDevicesEnumerated);
    chrome.hid.onDeviceAdded.addListener(onDeviceAdded);
} else {
    const AutoLaunch = require('auto-launch');
    const autoLaunch = new AutoLaunch({
        name: 'OnlyKey'
    });

    // read localStorage setting or default to true if first time running app
    const enableAutoLaunch = localStorage.hasOwnProperty('autoLaunch') ? !!localStorage.autoLaunch : localStorage.autoLaunch = true;
    
    autoLaunch.isEnabled()
        .then(isEnabled => {
            if (isEnabled && !enableAutoLaunch) {
                autoLaunch.disable();
            } else if(!isEnabled && enableAutoLaunch) {
                autoLaunch.enable();
            }
        })
        .catch(console.error);
}

function OnlyKeyLite() {
    this.deviceInfo = {
        vendorId: 5824,
        productId: 1158
    };
    this.maxInputReportSize = 64;
    this.maxOutputReportSize = 64;
    this.maxFeatureReportSize = 0;
    this.messageHeader = [255, 255, 255, 255];
}

function onDevicesEnumerated(devices) {
    if (chrome.runtime.lastError) {
        console.error("onDevicesEnumerated ERROR:", chrome.runtime.lastError);
        return;
    }

    console.info("HID devices:", devices);

    for (var device of devices) {
        onDeviceAdded(device);
    }
}

function onDeviceAdded(device) {
    if (device.maxInputReportSize === onlyKeyLite.maxInputReportSize &&
        device.maxOutputReportSize === onlyKeyLite.maxOutputReportSize &&
        device.maxFeatureReportSize === onlyKeyLite.maxFeatureReportSize) {

        chrome.hid.connect(device.deviceId, function (connectInfo) {
            if (chrome.runtime.lastError) {
                console.error("ERROR CONNECTING:", chrome.runtime.lastError);
            } else if (!connectInfo) {
                console.warn("Unable to connect to device.");
            } else {
                console.info("CONNECTINFO:", connectInfo);
            }

            setTime(connectInfo.connectionId);
        });
    }
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
        } else {
            console.info("OKSETTIME complete");
        }
    });
}

function hexStrToDec(hexStr) {
    return parseInt(hexStr, 16).toString(10);
}
