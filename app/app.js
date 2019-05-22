/*jshint esnext: true */
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

var onDevicesEnumerated = function (devices) {
    if (chrome.runtime.lastError) {
        console.error("onDevicesEnumerated ERROR:", chrome.runtime.lastError);
        return;
    }

    if (devices && devices.length) {
        console.info("HID devices found:", devices);
        devices.forEach(onDeviceAdded);
    }
};

var onDeviceAdded = function (device) {
    // auto connect desired device
    const supportedDevice = getSupportedDevice(device);
    if (supportedDevice) {
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
            } else if(!isEnabled && enableAutoLaunch) {
                autoLaunch.enable();
            }
        })
        .catch(console.error);
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


    /*
    chrome.hid.send(connectionId, reportId, bytes.buffer, function () {
        if (chrome.runtime.lastError) {
            console.error("ERROR SENDING OKSETTIME:", chrome.runtime.lastError, { connectionId: connectionId });
            callback('ERROR SENDING OKSETTIME PACKETS');
            if (process.platform === 'linux') {
              alert(`Communication failed, follow instructions here when using app on Linux https://docs.crp.to/linux.html`);
            }
        } else {
            console.info("OKSETTIME complete");
        }
    });
    */
    var bytes2 = new Uint8Array(70);
    memcpy(bytes2+64, timeParts, 4); //SET BYTES 63 - 66 to Epoch Time
    bytes2[69] = OKSETTIME; //SET BYTE 69 to OKSETTIME
    sendViaUSBFeatureReports(bytes2);
}

function hexStrToDec(hexStr) {
    return parseInt(hexStr, 16).toString(10);
}


function sendViaUSBFeatureReports(bytes) {
  var size = bytes.length;
  var getbuffer = new Uint8Array(8); // Feature reports are 8 bytes
  var setbuffer = new Uint8Array(8); // 7 bytes usable for data, last byte is packet number
  var bytestosend = new Uint8Array(70); // Total bytes fixed size, 7*10 packets (0x80 - 0x89)
  var receivedbytes = new Uint8Array(28); // Total bytes fixed size, 7*4 packets (0xC0 - 0xC3)

  memcpy(bytestosend, bytes, bytes.length);

  // Need to add checksum of bytes 0 - 63 and store in bytes 64 and 65

  //First read bytes to make sure device is ready.
  chrome.hid.getFeatureReport(connectionId, reportId, getbuffer.buffer, function () {
    //Check that result is 00 02 02 03 03 03 05 00
    //If last byte is not 00 exit with error that device is not ready
    console.info("Get Feature Report :", getbuffer);
    if (getbuffer.buffer[8] != 0x00) {
      console.info("DEVICE NOT READY", getbuffer);
      callback('ERROR SENDING OKSETTIME PACKETS');
    }
  });

  for (var i = 0; i<=9; i++) {

    setbuffer.buffer[0] = bytestosend[(i*8)];
    setbuffer.buffer[1] = bytestosend[(i*8)+1];
    setbuffer.buffer[2] = bytestosend[(i*8)+2];
    setbuffer.buffer[3] = bytestosend[(i*8)+3];
    setbuffer.buffer[4] = bytestosend[(i*8)+4];
    setbuffer.buffer[5] = bytestosend[(i*8)+5];
    setbuffer.buffer[6] = bytestosend[(i*8)+6];
    setbuffer.buffer[7] = i+0x80;

    chrome.hid.sendFeatureReport(connectionId, reportId, setbuffer.buffer, function () {
        if (chrome.runtime.lastError) {
            console.error("ERROR SENDING OKSETTIME FEATURE:", chrome.runtime.lastError, { connectionId: connectionId });
            callback('ERROR SENDING OKSETTIME PACKETS');
        } else {
            console.info("SENT FEATURE REPORT :", i);
        }
    });

   if (setbuffer.buffer[7] < 0x89) {
      chrome.hid.getFeatureReport(connectionId, reportId, getbuffer.buffer, function () {
        console.info("Get Feature Report :", getbuffer);
        //Last byte of getbuffer.buffer should be 00 until last setbuffer[7] = 0x89
      });
    }

  }

  // Done sending now get Response in form of 5 getFeatureReports and then send a final setFeatureReport sf 00  00 00 00 00 00 00 00 8F to finish
  for (var i = 0; i<=5; i++) {
    chrome.hid.getFeatureReport(connectionId, reportId, getbuffer.buffer, function () {
      //Will receive reports as follows:
      // C0 - first 7 bytes
      //RD 00  0a 6b 12 1c 68 68 37 C0
      // C1 - second 7 bytes
      //RD 00  26 ab 8b 84 c3 1e 9c C1
      // C2 - third 7 bytes
      //RD 00  72 49 ac 34 a7 48 6e C2
      // C3 - forth 7 bytes
      // RD 00  89 00 00 00 d6 00 00 C3
      // C0 - first bytes sent again, this indicates we are done.
      // RD 00  0a 6b 12 1c 68 68 37 C0
      console.info("Get Feature Report :", getbuffer);
        if (getbuffer.buffer[7] == 0x89) {
          //add delay, MCU still processing
          i=0;
        } else if (getbuffer.buffer[7] >= 0xC0) {
          memcpy(receivedbytes+(7*(getbuffer.buffer[7]-0xC0), getbuffer, 7);
        }
        }
      }
    });
  }
 console.info("Received Response :", receivedbytes;
}

function memcpy(dst, dstOffset, src, srcOffset, length) {
  var dstU8 = new Uint8Array(dst, dstOffset, length);
  var srcU8 = new Uint8Array(src, srcOffset, length);
  dstU8.set(srcU8);
};
