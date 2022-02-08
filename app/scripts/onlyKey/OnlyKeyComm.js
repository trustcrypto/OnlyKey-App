const desktopApp = typeof nw !== "undefined";
let userPreferences, request;

if (desktopApp) {
  userPreferences = require("./scripts/userPreferences.js");
  request = require("request");
}

let backupsigFlag = -1;
let fwchecked = false;
let dialog;
let myOnlyKey;
let onlyKeyConfigWizard;

const DEVICE_TYPES = {
  CLASSIC: "classic",
  DUO: "duo",
};

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

    const isMatch = Object.keys(device).every(
      (prop) => device[prop] == deviceInfo[prop]
    );
    if (isMatch) {
      supportedDevice = device;
      break;
    }
  }
  return supportedDevice;
}

/* jshint esnext:true */

// A proxy for the Chrome HID service. Stored in a global variable so it is
// accessible for integration tests. We use this to simulate an OnlyKey being
// plugged into the computer.
const chromeHid = {
  // chrome.hid.connect(integer deviceId, function callback)
  connect: function (deviceId, callback) {
    if (deviceId === "mockDevice") {
      return callback({
        connectionId: "mockConnection",
      });
    } else {
      return chrome.hid.connect(deviceId, callback);
    }
  },

  // chrome.hid.disconnect(integer connectionId, function callback)
  disconnect: chrome.hid.disconnect,

  // chrome.hid.getDevices(object options, function callback)
  getDevices: chrome.hid.getDevices,

  // chrome.hid.receive(integer connectionId, function callback)
  receive: function (connectionId, callback) {
    if (connectionId === "mockConnection") {
      if (this._pendingReceive) {
        throw "There must not be multiple pending receives.";
      }
      this._pendingReceive = callback;
    } else {
      return chrome.hid.receive(connectionId, callback);
    }
  },

  mockResponse: function (response) {
    // Response is [reportId, data]. Note that WebDriver.executeScript will
    // convert the ArrayBuffer data to an object, so we have to convert it
    // back.
    var [reportId, data] = response;
    response = [reportId, new Uint8Array(Object.values(data)).buffer];

    if (!this._pendingReceive) {
      throw "Expected a pending receive, found none.";
    }
    var callback = this._pendingReceive;
    this._pendingReceive = null;
    callback.apply(chrome.hid, response);
  },

  _pendingReceive: null,

  // chrome.hid.send(integer connectionId, integer reportId, ArrayBuffer data, function callback)
  send: function (connectionId, reportId, data, callback) {
    if (connectionId === "mockConnection") {
      this._sent.push(arguments);

      // Simulate a successful send operation by calling the callback
      // without setting chrome.runtime.lastError.
      callback();
    } else {
      chrome.hid.send(connectionId, reportId, data, callback);
    }
  },

  _sent: [],

  // Event: chrome.hid.onDeviceAdded
  onDeviceAdded: {
    addListener: function (callback) {
      this._callbacks.push(callback);
      return chrome.hid.onDeviceAdded.addListener(callback);
    },

    _callbacks: [],

    mockDeviceAdded: function () {
      this._callbacks.forEach(function (callback) {
        callback.call(null, {
          collections: [
            {
              reportIds: [],
              usage: 1,
              usagePage: 61904,
            },
          ],
          deviceId: "mockDevice",
          maxFeatureReportSize: 0,
          maxInputReportSize: 64,
          maxOutputReportSize: 64,
          productId: 1158,
          productName: "Keyboard/RawHID",
          reportDescriptor: {},
          serialNumber: "4294967295",
          vendorId: 5824,
        });
      });
    },
  },

  // Event: chrome.hid.onDeviceRemoved
  onDeviceRemoved: {
    addListener: function (callback) {
      return chrome.hid.onDeviceRemoved.addListener(callback);
    },
  },
};

function OnlyKeyHID(onlyKeyConfigWizardArg) {
  onlyKeyConfigWizard = onlyKeyConfigWizardArg;
  myOnlyKey = new OnlyKey();
  dialog = new DialogMgr();
}

function OnlyKey(params = {}) {
  this.connection = -1;
  this.currentSlotId = null;

  Object.assign(this, params.deviceInfo); // vendorId, productId, maxInputReportSize, etc

  this.devicePinSet = true;
  this.fwUpdateSupport = false;

  this.isBootloader = false;
  this.isLocked = true;

  this.keyTypeModifiers = {
    Backup: 128, // 0x80
    Signature: 64, // 0x40
    Decryption: 32, // 0x20
  };

  this.labels = [];

  this.lastMessages = {
    sent: [],
    received: [],
  };

  this.messageHeader = [255, 255, 255, 255];
  this.messageFields = {
    LABEL: 1,
    URL: 15,
    NEXTKEY4: 18, //Before Username
    NEXTKEY1: 16, //After Username
    DELAY1: 17,
    USERNAME: 2,
    NEXTKEY5: 19, //Before OTP
    NEXTKEY2: 3, //After Password
    DELAY2: 4,
    PASSWORD: 5,
    NEXTKEY3: 6, //After OTP
    DELAY3: 7,
    TFATYPE: 8,
    TFAUSERNAME: 9,
    YUBIAUTH: 10,
    YUBIANDHMAC: 29,
    LOCKOUT: 11,
    WIPEMODE: 12,
    BACKUPKEYMODE: 20,
    derivedchallengeMode: 21,
    storedchallengeMode: 22,
    SECPROFILEMODE: 23,
    TYPESPEED: 13,
    LEDBRIGHTNESS: 24,
    LOCKBUTTON: 25,
    hmacchallengeMode: 26,
    modkeyMode: 27,
    KBDLAYOUT: 14,
  };

  this.messages = {
    OKSETPIN: 225, //0xE1
    OKSETSDPIN: 226, //0xE2
    OKSETPIN2: 227, //0xE3
    OKSETTIME: 228, //0xE4
    OKGETLABELS: 229, //0xE5
    OKSETSLOT: 230, //0xE6
    OKWIPESLOT: 231, //0xE7
    OKGETPUBKEY: 236,
    OKSIGN: 237,
    OKWIPEPRIV: 238,
    OKSETPRIV: 239,
    OKDECRYPT: 240,
    OKRESTORE: 241,
    OKFWUPDATE: 244,
  };

  this.pendingMessages = {};
  this.version = "";
}

OnlyKey.prototype.setConnection = function (connectionId) {
  console.info("Setting connectionId to " + connectionId);
  this.connection = connectionId;

  if (connectionId === -1) {
    myOnlyKey = new OnlyKey({
      deviceInfo: this.deviceInfo,
    });
    myOnlyKey.setInitialized(false);
    dialog.open(ui.disconnectedDialog);
  } else {
    dialog.open(ui.workingDialog);
    onlyKeyConfigWizard.init(myOnlyKey);
  }
};

OnlyKey.prototype.sendMessage = function (options, callback) {
  var bytesPerMessage = 64;

  var msgId =
    typeof options.msgId === "string" ? options.msgId.toUpperCase() : null;
  var slotId =
    typeof options.slotId === "number" || typeof options.slotId === "string"
      ? options.slotId
      : null;
  var fieldId =
    typeof options.fieldId === "string" || typeof options.fieldId === "number"
      ? options.fieldId
      : null;
  var contents =
    typeof options.contents === "number" ||
    (options.contents && options.contents.length)
      ? options.contents
      : "";
  var contentType =
    (options.contentType && options.contentType.toUpperCase()) || "HEX";

  callback = typeof callback === "function" ? callback : handleMessage;

  var reportId = 0;
  var bytes = new Uint8Array(bytesPerMessage);
  var cursor = 0;

  for (; cursor < this.messageHeader.length; cursor++) {
    bytes[cursor] = this.messageHeader[cursor];
  }

  if (msgId && this.messages[msgId]) {
    bytes[cursor] = strPad(this.messages[msgId], 2, 0);
    cursor++;
  }

  if (slotId !== null) {
    bytes[cursor] = strPad(slotId, 2, 0);
    cursor++;
  }

  if (fieldId !== null) {
    if (this.messageFields[fieldId]) {
      bytes[cursor] = strPad(this.messageFields[fieldId], 2, 0);
    } else {
      bytes[cursor] = fieldId;
    }

    cursor++;
  }

  if (!Array.isArray(contents)) {
    switch (typeof contents) {
      case "string":
        contents = contents.replace(
          /\\x([a-fA-F0-9]{2})/g,
          (match, capture) => {
            return String.fromCharCode(parseInt(capture, 16));
          }
        );

        for (var i = 0; i < contents.length && cursor < bytes.length; i++) {
          if (contents.charCodeAt(i) > 255) {
            throw "I am not smart enough to decode non-ASCII data.";
          }
          bytes[cursor++] = contents.charCodeAt(i);
        }
        break;
      case "number":
        if (contents < 0 || contents > 255) {
          throw "Byte value out of bounds.";
        }
        bytes[cursor++] = contents;
        break;
    }
  } else {
    contents.forEach(function (val) {
      bytes[cursor++] = contentType === "HEX" ? hexStrToDec(val) : val;
    });
  }

  var pad = 0;
  for (; cursor < bytes.length; ) {
    bytes[cursor++] = pad;
  }

  console.info(
    "SENDING " + msgId + " to connectionId " + this.connection + ":",
    bytes
  );

  chromeHid.send(this.connection, reportId, bytes.buffer, async function () {
    if (msgId != "OKFWUPDATE") await wait(100);
    if (chrome.runtime.lastError) {
      console.error(
        "ERROR SENDING" + (msgId ? " " + msgId : "") + ":",
        chrome.runtime.lastError,
        {
          connectionId: this.connection,
        }
      );
      callback("ERROR SENDING PACKETS");
    } else {
      myOnlyKey.setLastMessage("sent", msgId);
      callback(null, "OK");
    }
  });
};

OnlyKey.prototype.setLastMessage = function (type, msgStr = "") {
  if (msgStr) {
    var newMessage = {
      text: msgStr,
      timestamp: new Date().getTime(),
    };
    var messages = this.lastMessages[type] || [];
    var numberToKeep = 3;
    if (messages.length === numberToKeep) {
      messages.slice(numberToKeep - 1);
    }
    messages = [newMessage].concat(messages);
    this.lastMessages[type] = messages;
    if (type === "received" && onlyKeyConfigWizard) {
      onlyKeyConfigWizard.setLastMessages(messages);
    }
  }
};

OnlyKey.prototype.getLastMessage = function (type) {
  return this.lastMessages[type] &&
    this.lastMessages[type][0] &&
    this.lastMessages[type][0].hasOwnProperty("text")
    ? this.lastMessages[type][0].text
    : "";
};

OnlyKey.prototype.getLastMessageIndex = function (type, index) {
  return this.lastMessages[type] &&
    this.lastMessages[type][index] &&
    this.lastMessages[type][index].hasOwnProperty("text")
    ? this.lastMessages[type][index].text
    : "";
};

OnlyKey.prototype.flushMessage = async function (callback = () => {}) {
  const messageTypes = Object.keys(this.pendingMessages);
  const pendingMessagesTypes = messageTypes.filter(
    (type) => this.pendingMessages[type] === true
  );

  if (!pendingMessagesTypes.length) {
    console.info("No pending messages to flush.");
    return callback();
  }

  const msgId = pendingMessagesTypes[0];

  console.info(`Flushing pending ${msgId}.`);
  this.sendPinMessage({ msgId, poll: false }, () => {
    pollForInput({ flush: true }, (err, msg) => {
      this.setLastMessage("received", "Canceled");
      if (msg) {
        console.info("Flushed previous message.");
        return this.flushMessage(callback);
      } else {
        return callback();
      }
    });
  });
};

OnlyKey.prototype.listenforvalue = async function (succeed_msg) {
  await listenForMessageIncludes2("Error", succeed_msg).catch(error => {
    throw error;
  });
};

OnlyKey.prototype.listen = function (callback) {
  pollForInput({}, callback);
};

OnlyKey.prototype.setTime = async function (callback) {
  var currentEpochTime = Math.round(new Date().getTime() / 1000.0).toString(16);
  console.info("Setting current epoch time =", currentEpochTime);
  var timeParts = currentEpochTime.match(/.{2}/g);
  // Send OKSETTIME Twice, fixes issue where when attaching OnlyKey to a VM response is not received
  // Also clear out any rogue messages from other apps
  var options = {
    contents: timeParts,
    msgId: "OKSETTIME",
  };
  this.sendMessage(options, this.sendMessage(options, callback));
};

OnlyKey.prototype.getLabels = async function () {
  this.labels = "";
  await wait(900);
  this.sendMessage({ msgId: "OKGETLABELS" }, handleGetLabels);
};

function handleGetLabels(err, msg) {
  msg = typeof msg === "string" ? msg.trim() : "";
  console.info("HandleGetLabels msg:", msg);
  if (myOnlyKey.getLastMessage("sent") !== "OKGETLABELS") {
    return;
  }

  if (myOnlyKey.labels === "") {
    myOnlyKey.labels = [];
    return myOnlyKey.listen(handleGetLabels);
  }

  // if second char of response is a pipe, theses are labels
  const msgParts = msg.split("|");
  let slotNum = msgParts[0];
  switch (slotNum) {
    case '1a': slotNum = 20; break;
    case '1a': slotNum = 21; break;
    case '1c': slotNum = 22; break;
    case '1d': slotNum = 23; break;
    case '1e': slotNum = 24; break;
    default: slotNum = parseInt(slotNum, 10); break;
  }

  if (
    msg.includes("Error not in config mode") ||
    myOnlyKey.getLastMessage("received") == "Error not in config mode, hold button 6 down for 5 sec"
  ) {
    this.setLastMessage("received", "Error not in config mode, hold button 6 down for 5 sec");
  } else if (msg.indexOf("|") !== 2 || typeof slotNum !== "number" || slotNum < 1 || slotNum > 24) {
    myOnlyKey.listen(handleGetLabels);
  } else {
    myOnlyKey.labels[slotNum - 1] = msgParts[1];
    initSlotConfigForm();
    if (slotNum < 24 && (msg.indexOf("|") == 2 || msg.indexOf("|") == 3)) {
      myOnlyKey.listen(handleGetLabels);
    }
  }
}

OnlyKey.prototype.sendPinMessage = function (
  { msgId = "", pin = "", poll = true },
  callback = () => {}
) {
  this.pendingMessages[msgId] = !this.pendingMessages[msgId];
  var cb = poll ? pollForInput.bind(this, {}, callback) : callback;
  console.info(`sendPinMessage ${msgId}`);
  const messageParams = {
    msgId,
  };

  if (
    myOnlyKey.getLastMessage("received") ==
    "Error PIN is not between 7 - 10 digits"
  ) {
    this.setLastMessage("received", "Canceled");
    messageParams.msgId = "OKSETPIN";
    messageParams.poll = false;
  }

  if (
    myOnlyKey.getLastMessage("received").includes("UNLOCKED") ||
    myOnlyKey.getLastMessage("received").includes("INITIALIZED")
  ) {
    var cb2 = cb();
    cb = pollForInput.bind(this, {}, cb2);
  }

  const deviceType = myOnlyKey.getDeviceType();
  if (deviceType === DEVICE_TYPES.DUO) {
    messageParams.contents = pin;
    messageParams.contentType = "DEC";
  }
  this.sendMessage(messageParams, cb);
  console.info("last messages");
  console.info(myOnlyKey.getLastMessageIndex("received", 0));
  console.info(myOnlyKey.getLastMessageIndex("received", 1));
};

OnlyKey.prototype.sendSetPin = function (callback) {
  console.info("sendSetPin");
  this.sendPinMessage(
    {
      msgId: "OKSETPIN",
    },
    callback
  );
};

OnlyKey.prototype.sendSetSDPin = function (callback) {
  this.sendPinMessage(
    {
      msgId: "OKSETSDPIN",
    },
    callback
  );
};

OnlyKey.prototype.sendSetPin2 = function (callback) {
  this.sendPinMessage(
    {
      msgId: "OKSETPIN2",
    },
    callback
  );
};

OnlyKey.prototype.sendPin_DUO = function (pins, callback) {
  // if only 1 pin is sent, just send those pin chars as a login attempt
  // otherwise, concatenate all PINs sent and fill with null (hex 0)
  const pinCount = pins.length;
  const bytesPerPin = 16;
  const pinBytesLength =
    pinCount === 1 ? pins[0].length : pinCount * bytesPerPin;
  let pinBytes = new Array(pinBytesLength).fill(0);
  pins.forEach((pin, i) => {
    if (typeof pin !== "string") pin = "";
    // PIN chars should only be ascii 0-9
    // add 48 to send as DEC
    pin
      .split("")
      .forEach((char, j) => (pinBytes[i * 16 + j] = 48 + Number(char)));
  });
  this.sendPinMessage(
    {
      // msgId: pinCount === 1 ? 'OKPIN' : 'OKSETPIN',
      msgId: "OKSETPIN",
      pin: pinBytes,
    },
    async () => {
      // Check if PIN attempts exceeded
      if (
        myOnlyKey
          .getLastMessage("received")
          .indexOf("Error password attempts for this session exceeded") === 0
      ) {
        document.getElementById("locked-text-duo").innerHTML =
          "To prevent lockout OnlyKey only permits 3 failed PIN attempts at a time, please remove and reinsert OnlyKey to try again.";
        console.info("PIN attempts exeeded");
      } else {
        document.getElementById("locked-text-duo").innerHTML = `
      <h3>Please enter your PIN</h3>
      <form name="unlockOkDuoForm" id="unlockOkDuoForm">
        <input type="password" name="unlockOkDuoPin" id="unlockOkDuoPin" />
        <input type="button" name="unlockOkDuoSubmit" id="unlockOkDuoSubmit" value="Unlock" />
      </form>
      `;
      }
      return callback();
    }
  );
};

OnlyKey.prototype.setSlot = function (slotArg, field, value, callback) {
  let slot = slotArg || this.getSlotNum();
  if (typeof slot !== "number") slot = this.getSlotNum(slot);
  var options = {
    contents: value,
    msgId: "OKSETSLOT",
    slotId: slot,
    fieldId: field,
  };
  this.sendMessage(options, callback);
};

OnlyKey.prototype.wipeSlot = function (slotArg, field, callback) {
  let slot = slotArg || this.getSlotNum();
  if (typeof slot !== "number") slot = this.getSlotNum(slot);
  const options = {
    msgId: "OKWIPESLOT",
    slotId: slot,
    fieldId: field || null,
  };
  this.sendMessage(options, callback);
};

OnlyKey.prototype.getSlotNum = function (slotIdArg) {
  const slotId = slotIdArg || this.currentSlotId;
  const maxSlotInteger = this.getDeviceType() === DEVICE_TYPES.CLASSIC ? 6 : 12;
  const slotNum = parseInt(slotId, 10) + (slotId.match(/a|b/)[0] === 'a' ? 0 : maxSlotInteger);
  return slotNum;
};

OnlyKey.prototype.setYubiAuth = function (
  publicId,
  privateId,
  secretKey,
  callback
) {
  this.setSlot(
    "XX",
    "YUBIAUTH",
    (publicId + privateId + secretKey).match(/.{2}/g),
    async () => {
      await this.listenforvalue("set AES Key");
      return callback();
    }
  );
};

OnlyKey.prototype.wipeYubiAuth = function (callback) {
  this.wipeSlot("XX", "YUBIAUTH", async () => {
    await this.listenforvalue("wiped AES Key");
    return callback();
  });
};

OnlyKey.prototype.setRSABackupKey = async function (key, passcode, cb) {
  var privKey;
  let error;

  try {
    var privKeys = await openpgp.key.readArmored(key);
    privKey = privKeys.keys[0];

    var success = privKey.decrypt(passcode);

    if (!success) {
      error = "Private Key decryption failed.";
      this.setLastMessage("received", error + " Did you forget your passcode?");
      throw Error(error);
    }

    if (!(privKey.primaryKey && privKey.primaryKey.params)) {
      error =
        "Private Key decryption was successful, but resulted in invalid mpi data.";
      this.setLastMessage("received", error);
      throw Error(error);
    }

    if (
      !(
        privKey.primaryKey &&
        privKey.primaryKey.params &&
        privKey.primaryKey.params.length === 6
      )
    ) {
      error =
        "Private Key decryption was successful, but resulted in invalid mpi data.";
      this.setLastMessage("received", error);
      throw Error(error);
    }
  } catch (parseError) {
    error = "Error parsing RSA key.";
    this.setLastMessage("received", error);
    throw Error(error + "\n\n" + parseError);
  }

  await onlyKeyConfigWizard.initKeySelect(privKey, function (err) {
    ui.rsaForm.setError(err || "");
    if (typeof cb === "function") cb(err);
  });
};

OnlyKey.prototype.setBackupPassphrase = async function (passphrase, cb) {
  // abcdefghijklmnopqrstuvwxyz
  let key, type, slot;
  try {
    key = await Array.from(openpgp.crypto.hash.digest(8, passphrase)); // 32 byte backup key is Sha256 hash of passphrase
    type = 161; //Backup and Decryption key
    slot = 131;
  } catch (e) {
    return cb(e);
  }

  this.setPrivateKey(slot, type, key, async function (err) {
    onlyKeyConfigWizard.initForm.reset();
    await wait(300);
    await listenForMessageIncludes2(
      "Error not in config mode, hold button 6 down for 5 sec",
      "Success"
    );
    cb(err);
  });
};

OnlyKey.prototype.submitFirmware = function (fileSelector, cb) {
  if (fileSelector.files && fileSelector.files.length) {
    var file = fileSelector.files[0];
    var reader = new FileReader();

    reader.onload = (function (theFile) {
      return async function (e) {
        let contents = e.target && e.target.result && e.target.result.trim();

        try {
          console.info("unparsed contents", contents);
          contents = parseFirmwareData(contents);
          console.info("parsed contents", contents);
        } catch (parseError) {
          throw new Error("Could not parse firmware file.\n\n" + parseError);
        }

        if (contents) {
          onlyKeyConfigWizard.newFirmware = contents;
          if (!myOnlyKey.isBootloader) {
            console.info("Working... Do not remove OnlyKey");

            const temparray = "1234";
            submitFirmwareData(temparray, function (err) {
              //First send one message to kick OnlyKey (in config mode) into bootloader
              console.info("Firmware file sent to OnlyKey");
              myOnlyKey.listen(handleMessage); //OnlyKey will respond with "SUCCESSFULL FW LOAD REQUEST, REBOOTING..." or "ERROR NOT IN CONFIG MODE, HOLD BUTTON 6 DOWN FOR 5 SEC"
            });
          } else {
            await loadFirmware();
          }
        } else {
          throw new Error("Incorrect firmware data format.");
        }
      };
    })(file);

    // Read in the image file as a data URL.
    reader.readAsText(file);
  } else {
    throw new Error("Please select a file first.");
  }
};

OnlyKey.prototype.submitRestore = function (fileSelector, cbArg) {
  const cb = typeof cbArg === "function" ? cbArg : () => {};
  const _this = this;
  ui.restoreForm.setError("");

  if (fileSelector.files && fileSelector.files.length) {
    var file = fileSelector.files[0];
    var reader = new FileReader();

    reader.onload = (function (theFile) {
      return function (e) {
        var contents = e.target && e.target.result && e.target.result.trim();
        try {
          contents = parseBackupData(contents);
        } catch (parseError) {
          const error = "Could not parse backup file.";
          _this.setLastMessage("received", error);
          throw Error(error + "\n\n" + parseError);
        }

        if (contents) {
          var step10text = document.getElementById("step10-text");
          step10text.innerHTML =
            "Restoring from backup please wait...<br><br>" +
            "<img src='/images/Pacman-0.8s-200px.gif' height='40' width='40'><br><br>";
          submitRestoreData(contents, async function (err) {
            if (err) {
              _this.setLastMessage(error);
              throw Error(error);
            }

            _this.setLastMessage("Backup file sent to OnlyKey, please wait...");
            await wait(10000);
            step10text.innerHTML = "";
            cb();
          });
        } else {
          const error = "Incorrect backup data format.";
          _this.setLastMessage(error);
          throw Error(error);
        }
      };
    })(file);

    // Read in the image file as a data URL.
    reader.readAsText(file);
  } else {
    var contents = "000000000";
    submitRestoreData(contents, function (err) {
      if (err) {
        _this.setLastMessage(error);
        throw Error(error);
      }

      _this.setLastMessage("Backup file sent to OnlyKey.");
      cb();
    });
  }
};

OnlyKey.prototype.setPrivateKey = async function (slot, type, key, callback) {
  var msg, contentType;
  if (Array.isArray(key) || key.constructor === Uint8Array) {
    // RSA private key is an array of DEC bytes
    contentType = "DEC";
    msg = key;
  } else {
    // private key strings should be pairs of HEX bytes
    msg = key.match(/.{2}/g);
  }

  var options = {
    contents: msg,
    msgId: "OKSETPRIV",
    slotId: slot,
    fieldId: type,
    contentType: contentType,
  };
  this.sendMessage(options, callback);
};

OnlyKey.prototype.wipePrivateKey = function (slot, callback) {
  var options = {
    msgId: "OKWIPEPRIV",
    slotId: slot,
  };
  this.sendMessage(options, callback);
};

OnlyKey.prototype.restore = async function (
  restoreData,
  packetHeader,
  callback
) {
  var msg = [packetHeader];
  msg = msg.concat(restoreData.match(/.{2}/g));
  var options = {
    contents: msg,
    msgId: "OKRESTORE",
  };
  this.sendMessage(options, callback);
};

OnlyKey.prototype.firmware = async function (
  firmwareData,
  packetHeader,
  callback
) {
  var msg = [packetHeader];
  msg = msg.concat(firmwareData.match(/.{2}/g));
  var options = {
    contents: msg,
    msgId: "OKFWUPDATE",
  };
  console.info("OKFWUPDATE message sent ");
  console.info(options);
  this.sendMessage(options, callback);
};

OnlyKey.prototype.setLockout = function (lockout, callback) {
  this.setSlot("XX", "LOCKOUT", lockout, async () => {
    await this.listenforvalue("set idle timeout");
    return callback();
  });
};

OnlyKey.prototype.setWipeMode = function (wipeMode) {
  this.setSlot("XX", "WIPEMODE", wipeMode, async () => {
    return await this.listenforvalue("set Wipe Mode");
  });
};

OnlyKey.prototype.setSecProfileMode = function (secProfileMode, callback) {
  secProfileMode = parseInt(secProfileMode, 10);
  var options = {
    contents: secProfileMode,
    msgId: "OKSETSLOT",
    slotId: "XX",
    fieldId: "SECPROFILEMODE",
  };
  this.sendMessage(options, callback);
};

OnlyKey.prototype.setderivedchallengeMode = function (derivedchallengeMode) {
  this.setSlot("XX", "derivedchallengeMode", derivedchallengeMode, async () => {
    return await this.listenforvalue("challenge mode");
  });
};

OnlyKey.prototype.setstoredchallengeMode = function (storedchallengeMode) {
  this.setSlot("XX", "storedchallengeMode", storedchallengeMode, async () => {
    return await this.listenforvalue("challenge mode");
  });
};

OnlyKey.prototype.sethmacchallengeMode = function (hmacchallengeMode) {
  this.setSlot("XX", "hmacchallengeMode", hmacchallengeMode, async () => {
    return await this.listenforvalue("HMAC Challenge Mode");
  });
};

OnlyKey.prototype.setmodkeyMode = function (modkeyMode) {
  this.setSlot("XX", "modkeyMode", modkeyMode, async () => {
    return await this.listenforvalue("Sysadmin Mode");
  });
};

OnlyKey.prototype.setbackupKeyMode = function (backupKeyMode) {
  backupKeyMode = parseInt(backupKeyMode, 10);
  this.setSlot("XX", "BACKUPKEYMODE", backupKeyMode,  async () => {
    return await this.listenforvalue("set Backup Key Mode");
  });
};

OnlyKey.prototype.setTypeSpeed = function (typeSpeed) {
  this.setSlot("XX", "TYPESPEED", typeSpeed, async () => {
    return await this.listenforvalue("set keyboard typespeed");
  });
};

OnlyKey.prototype.setLedBrightness = function (ledBrightness) {
  this.setSlot("XX", "LEDBRIGHTNESS", ledBrightness, async () => {
    return await this.listenforvalue("set LED brightness");
  });
};

OnlyKey.prototype.setLockButton = function (lockButton) {
  this.setSlot("XX", "LOCKBUTTON", lockButton, async () => {
    return await this.listenforvalue("set lock button");
  });
};

OnlyKey.prototype.setKBDLayout = function (kbdLayout) {
  this.setSlot("XX", "KBDLAYOUT", kbdLayout, async () => {
    return await this.listenforvalue("set keyboard layout");
  });
};

OnlyKey.prototype.setVersion = function (version) {
  this.version = version;
};

OnlyKey.prototype.getVersion = function () {
  return this.version;
};

OnlyKey.prototype.setDeviceType = function (version = "") {
  if (this.getDeviceType()) return; // only allow setting deviceType once
  const lastChar = version[version.length - 1].toLowerCase();
  this.devicePinSet = true;
  let deviceType;

  switch (lastChar) {
    case "n":
      this.devicePinSet = false;
    case "p":
      deviceType = DEVICE_TYPES.DUO;
      break;
    case "c":
    default:
      if (version.includes("BOOTLOADER")) {
        deviceType = "UNINITIALIZED";
      } else {
        deviceType = DEVICE_TYPES.CLASSIC;
        // throw Error(`Unable to determine deviceType from version ${version}`);
      }
  }
  console.info(`Setting deviceType to ${deviceType}`);
  this.deviceType = deviceType;
  onlyKeyConfigWizard.init(this);
  return deviceType;
};

OnlyKey.prototype.getDeviceType = function () {
  return this.deviceType;
};

OnlyKey.prototype.initBootloaderMode = function () {
  this.inBootloader = true;

  loadFirmware(function (err) {
    myOnlyKey.listen(handleMessage);
  });
};

OnlyKey.prototype.setInitialized = function (initializedArg) {
  const initialized = initializedArg;
  if (initialized !== this.isInitialized) {
    this.isInitialized = initialized;
    onlyKeyConfigWizard.init(this);
  }
};

var ui = {
  showInitPanel: null,
  showSlotPanel: null,
  showPrefPanel: null,
  showKeysPanel: null,
  showBackupPanel: null,
  showFirmwarePanel: null,
  showAdvancedPanel: null,
  showToolsPanel: null,
  initPanel: null,
  slotPanel: null,
  prefPanel: null,
  keysPanel: null,
  backupPanel: null,
  firmwarePanel: null,
  advancedPanel: null,
  toolsPanel: null,
  slotConfigBtns: null,
  slotConfigForm: null,
  slotConfigDialog: null,
  lockedDialog: null,
  lockedDialogDuo: null,
  workingDialog: null,
  disconnectedDialog: null,
  main: null,
};

var initializeWindow = function () {
  for (var k in ui) {
    var id = k.replace(/([A-Z])/g, "-$1").toLowerCase();
    var element = document.getElementById(id);
    if (!element) {
      throw "Missing UI element: " + k + ", " + id;
    }
    ui[k] = element;

    if (k.indexOf("show") === 0) {
      ui[k].addEventListener("click", toggleConfigPanel);
    }
  }

  ui.yubiAuthForm = document["yubiAuthForm"];
  ui.lockoutForm = document["lockoutForm"];
  ui.typeSpeedForm = document["typeSpeedForm"];
  ui.ledBrightnessForm = document["ledBrightnessForm"];
  ui.lockButtonForm = document["lockButtonForm"];
  ui.keyboardLayoutForm = document["keyboardLayoutForm"];
  ui.eccForm = document["eccForm"];
  ui.rsaForm = document["rsaForm"];
  ui.backupForm = document["backupForm"];
  ui.restoreForm = document["restoreForm"];
  ui.firmwareForm = document["firmwareForm"];

  ui.getLockedDialog = (ok) =>
    ok.getDeviceType() === DEVICE_TYPES.DUO
      ? ui.lockedDialogDuo
      : ui.lockedDialog;

  enableIOControls(false);
  enableAuthForms();
  enumerateDevices();
};

var enableIOControls = function (ioEnabled) {
  closeSlotConfigForm();

  if (!ioEnabled) {
    ui.main.classList.add("hide");
    if (myOnlyKey.connection === -1) {
      dialog.open(ui.disconnectedDialog);
    }
  }

  if (myOnlyKey.isInitialized) {
    if (myOnlyKey.isLocked) {
      dialog.open(ui.getLockedDialog(myOnlyKey));
    } else if (myOnlyKey.isBootloader) {
      ui.main.classList.remove("hide");
      ui.initPanel.classList.add("hide");
      ui.showInitPanel.classList.remove("hide", "active");
      ui.slotPanel.classList.add("hide");
      ui.showSlotPanel.classList.remove("hide", "active");
      ui.prefPanel.classList.add("hide");
      ui.showPrefPanel.classList.remove("hide", "active");
      ui.keysPanel.classList.add("hide");
      ui.showKeysPanel.classList.remove("hide", "active");
      ui.backupPanel.classList.add("hide");
      ui.backupPanel.classList.remove("active");
      ui.firmwarePanel.classList.remove("hide");
      ui.advancedPanel.classList.add("hide");
      ui.advancedPanel.classList.remove("active");
      ui.toolsPanel.classList.add("hide");
      ui.toolsPanel.classList.remove("active");
      ui.keysPanel.classList.add("hide");
      ui.keysPanel.classList.remove("active");
      ui.showBackupPanel.classList.remove("hide", "active");
      ui.showFirmwarePanel.classList.remove("hide");
      ui.showFirmwarePanel.classList.add("active");
      ui.showAdvancedPanel.classList.remove("hide", "active");
      ui.showToolsPanel.classList.remove("hide", "active");
      dialog.close(ui.getLockedDialog(myOnlyKey));
    } else {
      ui.main.classList.remove("hide");
      ui.initPanel.classList.add("hide");
      ui.showInitPanel.classList.remove("hide", "active");
      ui.slotPanel.classList.remove("hide");
      ui.showSlotPanel.classList.remove("hide");
      ui.showSlotPanel.classList.add("active");
      ui.prefPanel.classList.add("hide");
      ui.showPrefPanel.classList.remove("hide", "active");
      ui.keysPanel.classList.add("hide");
      ui.showKeysPanel.classList.remove("hide", "active");
      ui.backupPanel.classList.add("hide");
      ui.backupPanel.classList.remove("active");
      ui.firmwarePanel.classList.add("hide");
      ui.firmwarePanel.classList.remove("active");
      ui.advancedPanel.classList.add("hide");
      ui.advancedPanel.classList.remove("active");
      ui.toolsPanel.classList.add("hide");
      ui.toolsPanel.classList.remove("active");
      ui.keysPanel.classList.add("hide");
      ui.keysPanel.classList.remove("active");
      ui.showBackupPanel.classList.remove("hide", "active");
      ui.showFirmwarePanel.classList.remove("hide", "active");
      ui.showAdvancedPanel.classList.remove("hide", "active");
      ui.showToolsPanel.classList.remove("hide", "active");
      dialog.close(ui.getLockedDialog(myOnlyKey));
    }
  } else {
    ui.main.classList.remove("hide");
    ui.slotPanel.classList.add("hide");
    ui.slotPanel.classList.remove("active");
    ui.backupPanel.classList.add("hide");
    ui.backupPanel.classList.remove("active");
    ui.firmwarePanel.classList.add("hide");
    ui.firmwarePanel.classList.remove("active");
    ui.advancedPanel.classList.add("hide");
    ui.advancedPanel.classList.remove("active");
    ui.toolsPanel.classList.add("hide");
    ui.toolsPanel.classList.remove("active");
    ui.keysPanel.classList.add("hide");
    ui.keysPanel.classList.remove("active");
    ui.prefPanel.classList.add("hide");
    ui.prefPanel.classList.remove("active");
    ui.initPanel.classList.remove("hide");
    ui.showInitPanel.classList.remove("hide");
    ui.showInitPanel.classList.add("active");
    ui.showSlotPanel.classList.add("hide");
    ui.showPrefPanel.classList.add("hide");
    ui.showKeysPanel.classList.add("hide");
    ui.showBackupPanel.classList.add("hide");
    ui.showAdvancedPanel.classList.add("hide");
    ui.showToolsPanel.classList.add("hide");
    ui.showFirmwarePanel.classList.add("hide");
    dialog.close(ui.getLockedDialog(myOnlyKey));
  }
};

var enumerateDevices = function () {
  for (let d = 0; d < SUPPORTED_DEVICES.length; d++) {
    const { vendorId, productId } = SUPPORTED_DEVICES[d];

    const deviceInfo = {
      vendorId,
      productId,
    };

    console.log(`Checking for devices with vendorId ${vendorId} and productId ${productId}...`);

    chromeHid.getDevices(deviceInfo, onDevicesEnumerated);
  }
};

var onDevicesEnumerated = async function (devices) {
  if (chrome.runtime.lastError) {
    console.error("onDevicesEnumerated ERROR:", chrome.runtime.lastError);
    return;
  }

  if (devices && devices.length) {
    console.info("HID devices found:", devices);
    for (let i in devices) {
      await onDeviceAdded(devices[i]);
    }
    console.info("Connection ID", myOnlyKey.connection);
  }
};

var onDeviceAdded = async function (device) {
  var supportedDevice = getSupportedDevice(device);
  console.info(device.collections[0].usage);
  if (
    supportedDevice &&
    device.collections[0].usagePage == "65451" &&
    device.serialNumber == "1000000000"
  ) {
    await connectDevice(device);
  } else if (supportedDevice && device.serialNumber != "1000000000") {
    //Before Beta 8 fw
    console.info("Beta 8+ device not found, looking for old device");
    await connectDevice(device);
  }
};

var connectDevice = async function (device) {
  const deviceId = device.deviceId;

  console.info("CONNECTING device:", device);

  dialog.close(ui.disconnectedDialog);
  dialog.open(ui.workingDialog);

  chromeHid.connect(deviceId, async function (connectInfo) {
    if (chrome.runtime.lastError) {
      console.error("ERROR CONNECTING:", chrome.runtime.lastError);
    } else if (!connectInfo) {
      console.warn("Unable to connect to device.");
    }

    myOnlyKey.setConnection(connectInfo.connectionId);
    await myOnlyKey.setTime(pollForInput);
    enableIOControls(true);
  });
};

var onDeviceRemoved = function () {
  console.info(
    "ONDEVICEREMOVED was triggered with connectionId",
    myOnlyKey.connection
  );
  if (myOnlyKey.connection === -1) return handleDisconnect();

  chromeHid.disconnect(myOnlyKey.connection, function () {
    if (chrome.runtime.lastError) {
      return console.warn("DISCONNECT ERROR:", chrome.runtime.lastError);
    }
    console.info("DISCONNECTED CONNECTION", myOnlyKey.connection);
    handleDisconnect();
  });
};

function handleDisconnect() {
  myOnlyKey.setConnection(-1);
  delete myOnlyKey.deviceType;
  myOnlyKey.setLastMessage("received", "Disconnected");
  onlyKeyConfigWizard.initForm.reset();
  enableIOControls(false);
}

var pollForInput = function (optionsParam, callbackParam) {
  clearTimeout(myOnlyKey.poll);

  const callback =
    typeof callbackParam === "function" ? callbackParam : handleMessage;
  const options = optionsParam || {};
  let msg;
  let version;

  chromeHid.receive(myOnlyKey.connection, async function (reportId, data) {
    if (chrome.runtime.lastError) {
      myOnlyKey.setLastMessage("received", "[error]");
      return callback(chrome.runtime.lastError);
    } else {
      msg = readBytes(new Uint8Array(data));
    }

    console.info("RECEIVED:", msg);
    myOnlyKey.setDeviceType(msg);

    if (msg.length > 1 && msg !== "OK" && !options.flush) {
      myOnlyKey.setLastMessage("received", msg);
    }

    // if message begins with Error, call callback with msg as err
    // and the last sent message as 2nd arg
    if (msg.indexOf("Error") === 0 || msg.indexOf("ERROR") === 0) {
      return callback(msg, myOnlyKey.getLastMessage("sent"));
    } else if (msg.indexOf("UNINITIALIZEDv") >= 0) {
      myOnlyKey.fwUpdateSupport = true;
      version = msg.split("UNINITIALIZED").pop();
      handleVersion(version);
      desktopApp &&
        (await checkForNewFW(
          userPreferences.autoUpdateFW,
          myOnlyKey.fwUpdateSupport,
          version
        ));
    } else if (msg.indexOf("UNINITIALIZED") >= 0) {
      myOnlyKey.fwUpdateSupport = false;
      version = "v0.2-beta.6";
      var upgradetext = document.getElementById("upgrade-text");
      upgradetext.innerHTML =
        "This application is designed to work with a newer version of OnlyKey firmware. <br>Go to https://docs.crp.to/upgradeguide.html ";
      handleVersion(version);
      desktopApp &&
        (await checkForNewFW(
          userPreferences.autoUpdateFW,
          myOnlyKey.fwUpdateSupport,
          version
        ));
      return;
    } else if (msg.indexOf("UNLOCKED") >= 0) {
      version = msg.split("UNLOCKED").pop();
      handleVersion(version);
      if (version && (version[9] != "." || version[10] > 6)) {
        //Firmware update through app supported
        myOnlyKey.fwUpdateSupport = true;
      }
      desktopApp &&
        (await checkForNewFW(
          userPreferences.autoUpdateFW,
          myOnlyKey.fwUpdateSupport,
          version
        ));
    }

    return await callback(null, msg);
  });
};

var readBytes = function (bytes) {
  var msgStr = "";
  var msgBytes = new Uint8Array(bytes.buffer);

  for (var i = 0; i < msgBytes.length; i++) {
    if (msgBytes[i] > 31 && msgBytes[i] < 127)
      msgStr += String.fromCharCode(msgBytes[i]);
    else if (i === 0)
      // if first byte is a hex, this is probably a slot number
      msgStr += byteToHex(msgBytes[i]);
  }

  return msgStr;
};

var handleMessage = async function (err, msg) {
  if (err) {
    return console.error("MESSAGE ERROR:", err);
  }

  msg = msg.trim();
  var updateUI = false;
  var version;
  dialog.close(ui.workingDialog);

  const indexOfInitialized = msg.indexOf("INITIALIZED");

  switch (true) {
    case indexOfInitialized >= 0:
      myOnlyKey.setInitialized(indexOfInitialized === 0);
      updateUI = true;

      // special handling if last message sent was PIN-related
      if (myOnlyKey.getDeviceType() === DEVICE_TYPES.CLASSIC) {
        switch (myOnlyKey.getLastMessage("sent")) {
          case "OKSETPIN":
          case "OKSETPIN2":
          case "OKSETSDPIN":
            return pollForInput();
        }
      }
      break;
    default:
      break;
  }

  if (indexOfInitialized === 0) {
    // OK should still be locked
    pollForInput();
  }

  if (msg.replace(/\s/g, "").indexOf("UNINITIALIZEDv") >= 0) {
    myOnlyKey.fwUpdateSupport = true;
    version = msg.split("UNINITIALIZED").pop();
    handleVersion(version);
    updateUI = true;
    myOnlyKey.fwUpdateSupport = true;
  } else if (msg.indexOf("BOOTLOADER") >= 0) {
    myOnlyKey.setInitialized(true);
    myOnlyKey.isBootloader = true;
    myOnlyKey.isLocked = false;
    version = msg.split("UNLOCKED").pop();
    handleVersion(version);
    updateUI = true;
    myOnlyKey.fwUpdateSupport = true;
    myOnlyKey.initBootloaderMode();
  } else if (msg.indexOf("UNLOCKED") >= 0) {
    if (myOnlyKey.getLastMessage("sent") === "OKSETPRIV") {
      pollForInput();
    } else {
      myOnlyKey.setInitialized(true);
      version = msg.split("UNLOCKED").pop();
      handleVersion(version);
      if (version && (version[9] != "." || version[10] > 6)) {
        //Firmware update through app supported
        myOnlyKey.fwUpdateSupport = true;
      }
      if (myOnlyKey.isLocked) {
        myOnlyKey.isLocked = false;
        myOnlyKey.getLabels();
        updateUI = true;
      }
    }
  } else if (msg.indexOf("LOCKED") >= 0) {
    myOnlyKey.isLocked = true;
  }

  var firmwaretext = document.getElementById("firmware-text");
  var step8text = document.getElementById("step8-text");
  var step9text = document.getElementById("step9-text");
  if (myOnlyKey.isBootloader || !myOnlyKey.isInitialized) {
    //Firmware load in app without config mode
    firmwaretext.innerHTML =
      "To load a new firmware file to your OnlyKey, click [Choose File], select your firmware file, then click [Load Firmware to OnlyKey].</p><p>The OnlyKey will restart automatically when firmware load is complete.";
    step8text.innerHTML = " ";
    step9text.innerHTML = " ";
  } else if (myOnlyKey.fwUpdateSupport) {
    //Firmware load in app with config mode
    firmwaretext.innerHTML =
      `<p><u>Step 1</u>. Hold down the #6 button on your OnlyKey for 5+ seconds and release. The OnlyKey light will turn off. Re-enter your PIN to enter config mode.</p>
      <p><u>Step 2</u>. Click [Choose File], select your firmware file, then click [Load Firmware to OnlyKey].</p>
      <p><u>Step 3</u>. The OnlyKey will flash yellow while loading your firmware, then will restart automatically when firmware load is complete.</p>`;
    step8text.innerHTML =
      "To set a new passphrase on your OnlyKey, hold down the #6 button on your OnlyKey for 5+ seconds and release. The OnlyKey light will turn off. Re-enter your PIN to enter config mode.</p>";
    step9text.innerHTML =
      "To set a new passphrase on your OnlyKey, hold down the #6 button on your OnlyKey for 5+ seconds and release. The OnlyKey light will turn off. Re-enter your PIN to enter config mode.</p>";
  } else {
    //Firmware load not supported in app
    firmwaretext.innerHTML =
      "This version of firmware is outdated and does not support this feature. To load latest firmware follow the loading instructions <a href='https://docs.crp.to/usersguide.html#loading-onlykey-firmware' class='external'>here</a>";
    step8text.innerHTML =
      "This version of firmware is outdated and does not support this feature. To load latest firmware follow the loading instructions <a href='https://docs.crp.to/usersguide.html#loading-onlykey-firmware' class='external'>here</a>";
  }

  if (updateUI) {
    enableIOControls(true);
  }
};

function init() {
  console.info("OnlyKeyComm init() called");
  initializeWindow();
  myOnlyKey.setConnection(-1);
  chromeHid.onDeviceAdded.addListener(onDeviceAdded);
  chromeHid.onDeviceRemoved.addListener(onDeviceRemoved);
}

function toggleConfigPanel(e) {
  var clicked = this;
  var panels = {
    init: "Init",
    slot: "Slot",
    pref: "Pref",
    keys: "Keys",
    backup: "Backup",
    firmware: "Firmware",
    advanced: "Advanced",
    tools: "Tools",
  };
  var hiddenClass = "hide";
  var activeClass = "active";
  for (var panel in panels) {
    if (clicked.id.indexOf(panel) >= 0) {
      if (!clicked.classList.contains(activeClass)) {
        onlyKeyConfigWizard.reset();
        ui[panel + "Panel"].classList.remove(hiddenClass);
        ui["show" + panels[panel] + "Panel"].classList.add(activeClass);
      }
    } else {
      ui[panel + "Panel"].classList.add(hiddenClass);
      ui["show" + panels[panel] + "Panel"].classList.remove(activeClass);
    }
  }
  e && e.preventDefault && e.preventDefault();
}

function initSlotConfigForm() {
  const deviceType = myOnlyKey.getDeviceType();
  const deviceBtns = ui.slotConfigBtns.getElementsByClassName(`ok-${deviceType}`)[0];
  const configBtns = Array.from(deviceBtns.getElementsByTagName('input'));
  configBtns.forEach((btn, i) => {
    const slotId = btn.dataset.slotId || btn.value; // prefer data-slot-id
    const labelIndex = myOnlyKey.getSlotNum(slotId);
    const labelText = myOnlyKey.labels[labelIndex - 1] || 'empty';
    onlyKeyConfigWizard.setSlotLabel(i, labelText);
    btn.addEventListener('click', showSlotConfigForm);
  });
  ui.slotConfigDialog
    .getElementsByClassName('slot-config-close')[0]
    .addEventListener('click', closeSlotConfigForm);
  ui.slotConfigDialog.addEventListener('close', () => {
    document.getElementById('slotConfigErrors').innerHTML = '';
    ui.slotConfigForm.reset()
  });
}

function showSlotConfigForm(e) {
  const slotId = e.target.value;
  const slotUniqueId = e.target.dataset.slotId; // "data-slot-id" attribute
  myOnlyKey.currentSlotId = slotUniqueId;
  const slotLabel = document.getElementById('slotLabel' + slotUniqueId).innerText;
  ui.slotConfigDialog.getElementsByClassName('slotId')[0].innerText = slotId;

  document.getElementById('txtSlotLabel').value =
    slotLabel.toLowerCase() === 'empty' ? '' : slotLabel;
  dialog.open(ui.slotConfigDialog);
  initSlotConfigForm();
  e && e.preventDefault && e.preventDefault();
}

function closeSlotConfigForm(e) {
  dialog.close(ui.slotConfigDialog);
  e && e.preventDefault && e.preventDefault();
}

function enableAuthForms() {
  var yubiSubmit = document.getElementById("yubiSubmit");
  var yubiWipe = document.getElementById("yubiWipe");
  yubiSubmit.addEventListener("click", submitYubiAuthForm);
  yubiWipe.addEventListener("click", wipeYubiAuthForm);

  var lockoutSubmit = document.getElementById("lockoutSubmit");
  lockoutSubmit.addEventListener("click", submitLockout);

  const fullWipeModeBtn = document.getElementById("fullWipeModeBtn");
  fullWipeModeBtn.addEventListener("click", (e) => submitWipeMode(e, 2));

  const backupModeBtn = document.getElementById("backupModeBtn");
  backupModeBtn.addEventListener("click", (e) => submitBackupMode(e, 1));

  const storedKeyChallengeCodeBtn = document.getElementById("storedKeyChallengeCodeBtn");
  storedKeyChallengeCodeBtn.addEventListener("click", (e) => submitstoredchallengeMode(e, 0));
  const storedKeyBtnPressBtn = document.getElementById("storedKeyBtnPressBtn");
  storedKeyBtnPressBtn.addEventListener("click", (e) => submitstoredchallengeMode(e, 1));

  const derivedKeyChallengeCodeBtn = document.getElementById("derivedKeyChallengeCodeBtn");
  derivedKeyChallengeCodeBtn.addEventListener("click", (e) => submitderivedchallengeMode(e, 0));
  const derivedKeyBtnPressBtn = document.getElementById("derivedKeyBtnPressBtn");
  derivedKeyBtnPressBtn.addEventListener("click", (e) => submitderivedchallengeMode(e, 1));

  const disableModkeyModeBtn = document.getElementById("disableModkeyModeBtn");
  disableModkeyModeBtn.addEventListener("click", (e) => submitmodkeyMode(e, 0));
  const enableModkeyModeBtn = document.getElementById("enableModkeyModeBtn");
  enableModkeyModeBtn.addEventListener("click", (e) => submitmodkeyMode(e, 1));

  const disableHmacBtnPressBtn = document.getElementById("disableHmacBtnPressBtn");
  disableHmacBtnPressBtn.addEventListener("click", (e) => submithmacchallengeMode(e, 0));
  const enableHmacBtnPressBtn = document.getElementById("enableHmacBtnPressBtn");
  enableHmacBtnPressBtn.addEventListener("click", (e) => submithmacchallengeMode(e, 1));

  var typeSpeedSubmit = document.getElementById("typeSpeedSubmit");
  typeSpeedSubmit.addEventListener("click", submitTypeSpeed);

  var ledBrightnessSubmit = document.getElementById("ledBrightnessSubmit");
  ledBrightnessSubmit.addEventListener("click", submitLedBrightness);

  var lockButtonSubmit = document.getElementById("lockButtonSubmit");
  lockButtonSubmit.addEventListener("click", submitLockButton);

  var kbdLayoutSubmit = document.getElementById("kbdLayoutSubmit");
  kbdLayoutSubmit.addEventListener("click", submitKBDLayout);

  var eccSubmit = document.getElementById("eccSubmit");
  eccSubmit.addEventListener("click", submitEccForm);
  ui.eccForm.setError = function (errString) {
    document.getElementById("eccFormError").innerText = errString;
  };

  var eccWipe = document.getElementById("eccWipe");
  eccWipe.addEventListener("click", wipeEccKeyForm);

  var rsaSubmit = document.getElementById("rsaSubmit");
  rsaSubmit.addEventListener("click", submitRsaForm);
  ui.rsaForm.setError = function (errString) {
    document.getElementById("rsaFormError").innerText = errString;
  };

  var rsaWipe = document.getElementById("rsaWipe");
  rsaWipe.addEventListener("click", wipeRsaKey);

  var backupSave = document.getElementById("backupSave");
  backupSave.addEventListener("click", saveBackupFile);
  ui.backupForm.setError = function (errString) {
    document.getElementById("backupFormError").innerText = errString;
  };

  var backupVerify = document.getElementById("backupVerify");
  backupVerify.addEventListener("click", verifyBackupFile);
  ui.backupForm.setError = function (errString) {
    document.getElementById("backupFormError").innerText = errString;
  };

  var restoreFromBackup = document.getElementById("doRestore");
  restoreFromBackup.addEventListener("click", submitRestoreForm);
  ui.restoreForm.setError = function (errString) {
    document.getElementById("restoreFormError").innerText = errString;
  };

  var loadFirmware = document.getElementById("doFirmware");
  loadFirmware.addEventListener("click", submitFirmwareForm);
  ui.firmwareForm.setError = function (errString) {
    document.getElementById("firmwareFormError").innerText = errString;
  };

  ui.backupForm.setError("");
  ui.backupForm.reset();
  ui.restoreForm.setError("");
  ui.restoreForm.reset();
  ui.firmwareForm.setError("");
  ui.firmwareForm.reset();
}

function submitYubiAuthForm(e) {
  var publicId = ui.yubiAuthForm.yubiPublicId.value || "";
  var privateId = ui.yubiAuthForm.yubiPrivateId.value || "";
  var secretKey = ui.yubiAuthForm.yubiSecretKey.value || "";

  publicId = publicId.toString().replace(/\s/g, "");
  privateId = privateId.toString().replace(/\s/g, "");
  secretKey = secretKey.toString().replace(/\s/g, "");

  // going to be mean and only send the max chars allowed
  var maxPublicIdLength = 12; // 6 bytes
  var maxPrivateIdLength = 12; // 6 bytes
  var maxSecretKeyLength = 32; // 64 bytes
  publicId = hexToModhex(publicId.slice(0, maxPublicIdLength), true);
  privateId = privateId.slice(0, maxPrivateIdLength);
  secretKey = secretKey.slice(0, maxSecretKeyLength);

  // TODO: validation
  myOnlyKey.setYubiAuth(publicId, privateId, secretKey, function (err) {
    // TODO: check for success, then reset
    ui.yubiAuthForm.reset();
  });

  e && e.preventDefault && e.preventDefault();
}

function wipeYubiAuthForm(e) {
  myOnlyKey.wipeYubiAuth();
  e && e.preventDefault && e.preventDefault();
}

function submitEccForm(e) {
  ui.eccForm.setError("");

  var type = parseInt(ui.eccForm.eccType.value || "", 10);
  var slot = parseInt(ui.eccForm.eccSlot.value || "", 10);
  var key = ui.eccForm.eccKey.value || "";

  var maxKeyLength = 64; // 32 hex pairs

  var priv_type = "ECC";

  if (type == 0) {
    maxKeyLength = 40; // 20 hex pairs
    priv_type = "HMAC";
  }

  key = key.toString().replace(/\s/g, "").slice(0, maxKeyLength);

  if (!key) {
    return ui.eccForm.setError(
      priv_type + " Key cannot be empty. Use [Wipe] to clear a key."
    );
  }

  if (key.length !== maxKeyLength) {
    return ui.eccForm.setError(
      priv_type + " Key must be " + maxKeyLength + " characters."
    );
  }

  // set all type modifiers
  var typeModifier = 0;

  Object.keys(myOnlyKey.keyTypeModifiers).forEach(function (modifier) {
    if (ui.eccForm["eccSetAs" + modifier].checked) {
      typeModifier += myOnlyKey.keyTypeModifiers[modifier];
    }
  });

  type += typeModifier;

  myOnlyKey.setPrivateKey(slot, type, key, function (err) {
    myOnlyKey.listen(handleMessage);
    ui.eccForm.reset();
  });

  e && e.preventDefault && e.preventDefault();
}

function wipeEccKeyForm(e) {
  ui.eccForm.setError("");

  var slot = parseInt(ui.eccForm.eccSlot.value || "", 10);
  myOnlyKey.wipePrivateKey(slot, function (err) {
    myOnlyKey.listen(handleMessage);
  });

  e && e.preventDefault && e.preventDefault();
}

async function submitRsaForm(e) {
  e && e.preventDefault && e.preventDefault();
  ui.rsaForm.setError("");

  var key = ui.rsaForm.rsaKey.value || "";
  var passcode = ui.rsaForm.rsaPasscode.value || "";

  if (!key) {
    return ui.rsaForm.setError(
      "Key cannot be empty. Use [Wipe] to clear a key."
    );
  }
  if (key.includes("-----") && !key.includes("-----BEGIN PGP")) {
    var sshpk = require("sshpk");
    try {
      var allKeys = sshpk.parsePrivateKey(key, "pem", { passphrase: passcode });
    } catch (e) {
      return ui.rsaForm.setError("Error parsing SSH key: " + e.message);
    }
  } else {
    if (!passcode) {
      return ui.rsaForm.setError("Passcode cannot be empty.");
    }

    var privKey,
      keyObj = {},
      retKey;

    try {
      var privKeys = await openpgp.key.readArmored(key);
      privKey = privKeys.keys[0];

      var success = await privKey.decrypt(passcode);
      if (!success) {
        throw new Error(
          "Private Key decryption failed. Did you forget your passcode?"
        );
      }

      //console.info(privKey.primaryKey);
      //console.info(privKey.primaryKey.params);
      //console.info(privKey.primaryKey.params.length);

      if (!(privKey.primaryKey && privKey.primaryKey.params)) {
        throw new Error(
          "Key decryption was successful, but resulted in invalid data. Is this a valid OpenPGP key?"
        );
      }
    } catch (e) {
      return ui.rsaForm.setError("Error parsing PGP key: " + e.message);
    }

    var allKeys = {
      primaryKey: privKey.primaryKey,
      subKeys: privKey.subKeys,
    };
  }

  await onlyKeyConfigWizard.initKeySelect(allKeys, function (err) {
    ui.rsaForm.setError(err || "");
  });
}

OnlyKey.prototype.confirmRsaKeySelect = function (keyObj, slot, cb) {
  if (typeof keyObj.s !== "undefined") {
    //ECC
    var type = myOnlyKey.tempEccCurve;
    if (type == 0) {
      return ui.rsaForm.setError(
        "Unsupported ECC key type, key is not X25519 or NIST256p1."
      );
    }

    if (keyObj.s.length != 32) {
      return ui.rsaForm.setError("Selected key length should be 32 bytes.");
    }

    var retKey = Array.from(keyObj.s);
  } else {
    //RSA
    var type = parseInt(keyObj.p.length / 64, 10);

    if ([1, 2, 3, 4].indexOf(type) < 0) {
      return ui.rsaForm.setError(
        "Selected key length should be 1024, 2048, 3072, or 4096 bits."
      );
    }

    var retKey = [...keyObj.p, ...keyObj.q];
  }
  var slot =
    slot !== null ? slot : parseInt(ui.rsaForm.rsaSlot.value || "", 10);

  // set all type modifiers
  var typeModifier = 0;

  Object.keys(myOnlyKey.keyTypeModifiers).forEach(function (modifier) {
    if (
      ui.rsaForm["rsaSetAs" + modifier] &&
      ui.rsaForm["rsaSetAs" + modifier].checked
    ) {
      typeModifier += myOnlyKey.keyTypeModifiers[modifier];
    }
  });

  type += typeModifier;

  if (document.getElementById("rsaSlot").value === "99") {
    if (slot == 1) {
      type += 32;
      console.info("Slot 1 set as decryption key" + type);
    }
    if (slot == 2) {
      if (type > 127) type -= 128; // Only set backup flag on decryption key
      type += 64;
      console.info("Slot 2 set as signature key" + type);
    }
  }
  if (typeof keyObj.s !== "undefined") {
    //ECC
    if (slot < 101) slot += 100;
    myOnlyKey.setPrivateKey(slot, type, retKey, (err) => {
      // TODO: check for success, then reset
      if (typeof cb === "function") cb(err);
      ui.rsaForm.reset();
      if (backupsigFlag >= 0) {
        backupsigFlag = -1;
        //reset backup form
      }
      this.listen(handleMessage);
    });
  } else {
    submitRsaKey(slot, type, retKey, (err) => {
      // TODO: check for success, then reset
      if (typeof cb === "function") cb(err);
      ui.rsaForm.reset();
      if (backupsigFlag >= 0) {
        backupsigFlag = -1;
        //reset backup form
      }
      this.listen(handleMessage);
    });
  }
};

function submitRsaKey(slot, type, key, callback) {
  // this function should recursively call itself until all bytes are sent in chunks
  if (!Array.isArray(key)) {
    return callback("Invalid key format.");
  }
  var maxPacketSize = 57;
  var finalPacket = key.length - maxPacketSize <= 0;

  var cb = finalPacket
    ? callback
    : submitRsaKey.bind(null, slot, type, key.slice(maxPacketSize), callback);

  myOnlyKey.setPrivateKey(slot, type, key.slice(0, maxPacketSize), cb);
}

function saveBackupFile(e) {
  e && e.preventDefault && e.preventDefault();
  ui.backupForm.setError("");

  const backupData = ui.backupForm.backupData.value.trim();
  if (backupData) {
    const d = new Date();
    const dYear = d.getFullYear(),
          dMonth = strPad(d.getMonth() + 1, 2, 0),
          dDate = strPad(d.getDate(), 2, 0),          
          dHour = strPad(d.getHours(), 2, 0),
          dMinutes = strPad(d.getMinutes(), 2, 0);

    const df = `${dYear}-${dMonth}-${dDate}T${dHour}-${dMinutes}`;
          
    // format as onlykey-backup-2022-01-31T22-09.txt
    const filename = `onlykey-backup-${df}.txt`;
    const blob = new Blob([backupData], {
      type: "text/plain;charset=utf-8",
    });
    saveAs(blob, filename); // REQUIRES FileSaver.js polyfill

    document.getElementById("lastBackupFilename").innerText = filename;
    ui.backupForm.reset();
  } else {
    ui.backupForm.setError("Backup data cannot be empty space.");
  }
  document.getElementById("verifyBackupMessage").innerText = "";
}

function verifyBackupFile(e) {
  e && e.preventDefault && e.preventDefault();
  ui.backupForm.setError("");
  document.getElementById("verifyBackupMessage").innerText = "";
  var backupData = ui.backupForm.backupData.value.trim();
  if (backupData) {
    try {
      var backuphash = new Uint8Array(32).fill(0);
      var doesfwsupport;
      backupData.split("\n").forEach(function (line) {
        var sha256 = require('js-sha256');
        var hash = sha256.create();
        if (!line.includes("--")) {
          var valuetohash = hexStringtoByteArray(base64tohex(line));
          console.info("line to hash", valuetohash);
          hash.update(backuphash);
          hash.update(valuetohash);
          backuphash = hash.array();
          console.info("current hash", hash.hex());
        } else if (!line.includes("BACKUP")) { // This line is --<sha256hash>
          //TODO test that filebackuphash and backuphash are the same, if not backup is corrupt
          console.info("File hash", line.slice(2, line.length));
          var filebackuphash = base64tohex(line.slice(2, line.length)); // sha256 hash is 32 bytes
          console.info("computed backup hash", arraytoHexString(backuphash));
          console.info("file backup hash", filebackuphash);
          if (filebackuphash === arraytoHexString(backuphash).toUpperCase()) {
            document.getElementById("verifyBackupMessage").innerText = "Successfully verified backup SHA256 hash";
          } else {
            ui.backupForm.setError("ERROR this backup file is corrupt");
          }
          doesfwsupport = true;
        } 
      });
      if (!doesfwsupport) {
        ui.backupForm.setError("ERROR this backup file does not support verification");
      }
    } catch (parseError) {
      ui.backupForm.setError("ERROR this backup file is corrupt");
    }
  } else {
    ui.backupForm.setError("Backup data cannot be empty space.");
  }
}

function submitRestoreForm(e) {
  e && e.preventDefault && e.preventDefault();
  ui.restoreForm.setError("");

  var fileSelector = ui.restoreForm.restoreSelectFile;
  if (fileSelector.files && fileSelector.files.length) {
    var file = fileSelector.files[0];
    var reader = new FileReader();

    reader.onload = (function (theFile) {
      return function (e) {
        //console.info("RESULT:", e.target.result);
        var contents = e.target && e.target.result && e.target.result.trim();
        try {
          contents = parseBackupData(contents);
        } catch (parseError) {
          return ui.restoreForm.setError(
            "Could not parse backup file.\n\n" + parseError
          );
        }

        if (contents) {
          var restoretext = document.getElementById("restore-text");
          restoretext.innerHTML =
            "Restoring from backup please wait...<br><br>" +
            "<img src='/images/Pacman-0.8s-200px.gif' height='40' width='40'><br><br>";
          submitRestoreData(contents, async function (err) {
            // TODO: check for success, then reset
            await wait(10000);
            ui.restoreForm.reset();
            restoretext.innerHTML = "";
          });
        } else {
          return ui.restoreForm.setError("Incorrect backup data format.");
        }
      };
    })(file);

    // Read in the image file as a data URL.
    reader.readAsText(file);
  } else {
    ui.restoreForm.setError("Please select a file first.");
  }
}

function submitRestoreData(restoreData, callback) {
  // this function should recursively call itself until all bytes are sent in chunks
  if (!restoreData.length) {
    return callback();
  }

  var maxPacketSize = 114; // 57 byte pairs
  var finalPacket = restoreData.length - maxPacketSize <= 0;

  var cb = finalPacket
    ? callback
    : submitRestoreData.bind(null, restoreData.slice(maxPacketSize), callback);

  // packetHeader is hex number of bytes in certStr chunk
  var packetHeader = finalPacket ? (restoreData.length / 2).toString(16) : "FF";

  myOnlyKey.restore(restoreData.slice(0, maxPacketSize), packetHeader, cb);
}

function submitFirmwareForm(e) {
  e && e.preventDefault && e.preventDefault();

  ui.firmwareForm.setError("");
  var fileSelector = ui.firmwareForm.firmwareSelectFile;

  if (fileSelector.files && fileSelector.files.length) {
    var file = fileSelector.files[0];
    var reader = new FileReader();

    reader.onload = (function (theFile) {
      return async function (e) {
        let contents = e.target && e.target.result && e.target.result.trim();

        try {
          console.info("unparsed contents", contents);
          contents = parseFirmwareData(contents);
          console.info("parsed contents", contents);
        } catch (parseError) {
          return ui.firmwareForm.setError(
            "Could not parse firmware file.\n\n" + parseError
          );
        }

        if (contents) {
          onlyKeyConfigWizard.newFirmware = contents;
          if (!myOnlyKey.isBootloader) {
            ui.firmwareForm.setError("Working... Do not remove OnlyKey");

            const temparray = "1234";
            submitFirmwareData(temparray, function (err) {
              //First send one message to kick OnlyKey (in config mode) into bootloader
              //TODO if OnlyKey responds with SUCCESSFULL then continue, if not exit
              ui.firmwareForm.reset();
              ui.firmwareForm.setError("Firmware file sent to OnlyKey");

              myOnlyKey.listen(handleMessage); //OnlyKey will respond with "SUCCESSFULL FW LOAD REQUEST, REBOOTING..." or "ERROR NOT IN CONFIG MODE, HOLD BUTTON 6 DOWN FOR 5 SEC"
            });
          } else {
            await loadFirmware();
          }
        } else {
          return ui.firmwareForm.setError("Incorrect firmware data format.");
        }
      };
    })(file);

    // Read in the image file as a data URL.
    reader.readAsText(file);
  } else {
    ui.firmwareForm.setError("Please select a file first.");
  }
}

async function loadFirmware() {
  const firmwaretext = document.getElementById("firmware-text");
  const fwlength =
    onlyKeyConfigWizard.newFirmware && onlyKeyConfigWizard.newFirmware.length;

  if (fwlength) {
    // There is a firmware file to load]
    console.info(`Firmware file parsed into ${fwlength} lines.`); //Each line is a block in the blockchain

    for (let i = 0; i < fwlength; i++) {
      const line = onlyKeyConfigWizard.newFirmware[i].toString();
      console.info(`Line ${i}: ${line}`);

      firmwaretext.innerHTML =
        "Loading Firmware<br><br>" +
        "<img src='/images/Pacman-0.8s-200px.gif' height='40' width='40'><br><br>" +
        Number.parseFloat((i / fwlength) * 100).toFixed(0) +
        " Percent Complete";

      try {
        await submitFirmwareData(line);
        if (i < fwlength - 1) {
          console.info(`This signature`, line.slice(0, 64));
          console.info(`Block info`, line.slice(64, 65));
          console.info(`Next signature`, line.slice(65, 129));
          await listenForMessageIncludes("NEXT BLOCK");
        } else {
          console.info(`This signature`, line.slice(0, 64));
          console.info(`Block info`, line.slice(64, 65));
          await listenForMessageIncludes("SUCCESSFULLY LOADED FW");
          firmwaretext.innerHTML = "Firmware Load Complete!";
          ui.firmwareForm.setError("");
          document.getElementById("firmwareSelectFile").value = "";
          onlyKeyConfigWizard.newFirmware = null;
          //
        }
      } catch (err) {
        console.error(`Error submitting firmware data:`, err);
        return myOnlyKey.setLastMessage("received", err);
      }
    }

    // After loading firmware OnlyKey will reboot and version will no longer be "BOOTLOADER"
  }
}

/**
 * Use promise and setTimeout to wait x seconds
 */
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function checkForNewFW(checkForNewFW, fwUpdateSupport, version) {
  if (!fwchecked) {
    return new Promise((resolve, reject) => {
      fwchecked = true;
      if (checkForNewFW == true && fwUpdateSupport == true) {
        //fw checking enabled and firmware version supports app updates
        var r = request.get(
          "https://github.com/trustcrypto/OnlyKey-Firmware/releases/latest",
          function (err, res, body) {
            if (err) return reject(err);

            console.log(r.uri.href);
            console.log(this.uri.href);
            //var testupgradeurl = 'https://github.com/trustcrypto/OnlyKey-Firmware/releases/tag/v2.1.0-prod'
            //var latestver = testupgradeurl.split("/tag/v"); //end of redirected URL is the version
            var latestver = this.uri.href.split("/tag/v");
            latestver = latestver[1];
            console.info("Current verion", version);
            console.info("Latest verion", latestver);

            var thisver_maj = version.slice(1, 2) * 100;
            console.info(thisver_maj);
            var thisver_min = version.slice(3, 4) * 10;
            console.info(thisver_min);
            if (thisver_maj == 0) {
              var thisver_pat = version.slice(10, 11);
            } else {
              var thisver_pat = version.slice(5, 6);
            }
            var thisver_mod = version.slice(11, 12);
            console.info("Current verion mod", thisver_mod);
            var latestversplit = latestver.split(".")
            console.info(latestversplit);
            var latestver_maj = latestversplit[0] * 100;
            console.info("Latest verion maj", latestver_maj);
            var latestver_min = latestversplit[1] * 10;
            console.info("Latest verion min", latestver_min);
            if (latestver_maj == 0) {
              var latestver_pat = latestver.slice(10, 11);
            } else {
              var latestver_pat = latestversplit[2].split("-");
            }
            latestver_pat = latestver_pat[0];
            console.info("Latest verion pat", latestver_pat);

            if (
              thisver_maj + thisver_min + thisver_pat <
              latestver_maj + latestver_min + latestver_pat
            ) {
              if (version[9] != "." || version[10] > 6) {
                if (thisver_mod == "c" || thisver_mod == "g") {
                  if (
                    window.confirm(
                      "A new version of firware is available. Would you like to review the upgrade guide?"
                    )
                  ) {
                    const openMethod =
                      typeof nw === "undefined"
                        ? window.open
                        : nw.Shell.openExternal;
                    openMethod("https://docs.crp.to/upgradeguide.html");
                    if (
                      window.confirm(
                        "After reading the upgrade guide click OK to automatically download and install the latest standard edition OnlyKey firmware"
                      )
                    ) {
                      // Download latest standard firmware for color from URL
                      // https://github.com/trustcrypto/OnlyKey-Firmware/releases/download/
                      var downloadurl =
                        "https://github.com/trustcrypto/OnlyKey-Firmware/releases/download/" +
                        "v" + latestver +
                        "/Signed_OnlyKey_";
                      downloadurl = downloadurl +
                          latestver_maj / 100 +
                          "_" +
                          latestver_min / 10 +
                          "_" +
                          latestver_pat +
                          "_STD.txt";
                      console.info(downloadurl);
                      var req = request.get(
                        downloadurl,
                        async function (err, res, body) {
                          console.info(myOnlyKey.getLastMessage("received"));
                          if (
                            myOnlyKey
                              .getLastMessage("received")
                              .indexOf("UNINITIALIZEDv") >= 0 ||
                            window.confirm(
                              "To load new firmware file to your OnlyKey, hold down the #6 button on your OnlyKey for 5+ seconds and release. The OnlyKey light will turn off. Re-enter your PIN to enter config mode. Once this is completed your OnlyKey will flash red and you may click OK to load new firmware."
                            )
                          ) {
                            if (req.responseContent.body) {
                              var contents =
                                req.responseContent.body &&
                                req.responseContent.body.trim();
                              try {
                                console.info("unparsed contents", contents);
                                contents = parseFirmwareData(contents);
                                console.info("parsed contents", contents);
                              } catch (parseError) {
                                throw new Error(
                                  "Could not parse firmware file.\n\n" +
                                    parseError
                                );
                              }
                              console.info(contents);
                              onlyKeyConfigWizard.newFirmware = contents;
                              const temparray = "1234";
                              await submitFirmwareData(
                                temparray,
                                function (err) {
                                  //First send one message to kick OnlyKey (in config mode) into bootloader
                                  console.info(
                                    "Working... Do not remove OnlyKey"
                                  );
                                  console.info("Firmware file sent to OnlyKey");
                                  myOnlyKey.listen(handleMessage); //OnlyKey will respond with "SUCCESSFULL FW LOAD REQUEST, REBOOTING..." or "ERROR NOT IN CONFIG MODE, HOLD BUTTON 6 DOWN FOR 5 SEC"
                                }
                              );
                              resolve();
                            } else {
                              alert(`Firmware Download Failed`);
                              resolve();
                              return;
                            }
                          }
                        }
                      );
                    }
                  }
                }
              }
            }
          }
        );
      } else if (!fwUpdateSupport) {
        if (
          window.confirm(
            "This application is designed to work with a newer version of OnlyKey firmware. Click OK to go to the firmware download page."
          )
        ) {
          window.location.href =
            "https://docs.crp.to/usersguide.html#loading-onlykey-firmware";
        }
      }
      resolve();
    });
  }
}

function submitFirmwareData(firmwareData) {
  return new Promise(async function (resolve, reject) {
    // this function should recursively call itself until all bytes are sent in chunks
    if (!firmwareData.length) {
      return reject(`Invalid firmwareData`);
    }

    const maxPacketSize = 114; // 57 byte pairs
    const finalPacket = firmwareData.length - maxPacketSize <= 0;

    // packetHeader is hex number of bytes in chunk
    const packetHeader = finalPacket
      ? (firmwareData.length / 2).toString(16)
      : "FF";

    myOnlyKey.firmware(
      firmwareData.slice(0, maxPacketSize),
      packetHeader,
      async function () {
        await listenForMessageIncludes("RECEIVED OKFWUPDATE").then((result) => {
          if (finalPacket) {
            console.info(`FINAL PACKET SENT`);
            return resolve("submitFirmwareData complete");
          } else {
            submitFirmwareData(firmwareData.slice(maxPacketSize)).then(
              resolve,
              reject
            );
          }
        }, reject);
      }
    );
  });
}

async function listenForMessageIncludes(str) {
  return new Promise(async function listenForMessageIncludesAgain(
    resolve,
    reject
  ) {
    console.info(`Listening for "${str}"...`);
    myOnlyKey.listen(async (err, msg) => {
      if (msg && msg.includes(str)) {
        console.info(`Match received "${msg}"...`);
        resolve();
      } else if (msg && (msg.includes("UNLOCKED") || msg.includes("|"))) {
        //Chrome app background page sends settime which results in unexpected unlocked response
        console.info(
          `While waiting for "${str}", received unexpected message: ${msg}`
        );
        await listenForMessageIncludesAgain(resolve, reject);
      } else {
        reject(
          err ||
            `While waiting for "${str}", received unexpected message: ${msg}`
        );
      }
    });
  });
}

async function listenForMessageIncludes2(...args) {
  return new Promise(async function listenForMessageIncludesAgain2(
    resolve,
    reject
  ) {
    myOnlyKey.listen(async (err, msg) => {
      const strings = '"' + args.join('" or "') + '"';
      console.info(`Listening for ${strings}`);
      
      if (msg) {
        if (args.some(str => msg.includes(str))) {
          console.info(`Match received "${msg}"`);
        } else {
          console.info(`Received ${msg}`);
          //Chrome app background page sends settime which results in unexpected unlocked response
          if (!desktopApp) return await listenForMessageIncludesAgain2(resolve, reject);
        }
        return resolve();
      }
      
      console.info(`Error received "${err.message || err}"`);
      return reject(err);
    });
  });
}

function parseFirmwareData(contents = "") {
  // split by newline
  const lines = contents.split("\n");
  lines.shift(); //Remove -----BEGIN SIGNED FIRMWARE-----
  const newContent = [];

  for (let i = 0; i < lines.length - 1; i++) {
    let line = lines[i];
    console.info(`LENGTH: ${line.length}`);
    console.info(`BLOCK: ${line}`);
    newContent.push(line);
  }
  
  return newContent;
}

function wipeRsaKey(e) {
  e && e.preventDefault && e.preventDefault();
  ui.rsaForm.setError("");

  var slot = parseInt(ui.rsaForm.rsaSlot.value || "", 10);
  myOnlyKey.wipePrivateKey(slot, function (err) {
    myOnlyKey.listen(handleMessage);
  });
}

function submitLockout(e) {
  e && e.preventDefault && e.preventDefault();
  var lockout = parseInt(ui.lockoutForm.okLockout.value, 10);
  if (isNaN(lockout)) {
    lockout = 0;
  }

  if (typeof lockout !== "number" || lockout < 0) {
    lockout = 30;
  }

  lockout = Math.min(lockout, 255);

  myOnlyKey.setLockout(lockout, function (err) {
    myOnlyKey.setLastMessage(
      "received",
      "Lockout set to " +
        lockout +
        " minutes" +
        (lockout === 0 ? " (disabled)" : "")
    );
    ui.lockoutForm.reset();
  });
}

function submitstoredchallengeMode(e, storedchallengeMode) {
  e && e.preventDefault && e.preventDefault();
  return myOnlyKey.setstoredchallengeMode(storedchallengeMode);
}

function submitderivedchallengeMode(e, derivedchallengeMode) {
  e && e.preventDefault && e.preventDefault();
  return myOnlyKey.setderivedchallengeMode(derivedchallengeMode);
}

function submithmacchallengeMode(e, hmacchallengeMode) {
  e && e.preventDefault && e.preventDefault();
  return myOnlyKey.sethmacchallengeMode(hmacchallengeMode);
}

function submitmodkeyMode(e, modkeyMode) {
  e && e.preventDefault && e.preventDefault();
  return myOnlyKey.setmodkeyMode(modkeyMode);
}

function submitBackupMode(e, backupKeyMode) {
  e && e.preventDefault && e.preventDefault();
  return myOnlyKey.setbackupKeyMode(backupKeyMode);
}

function submitWipeMode(e, wipeMode) {
  e && e.preventDefault && e.preventDefault();
  return myOnlyKey.setWipeMode(wipeMode);
}

function submitTypeSpeed(e) {
  e && e.preventDefault && e.preventDefault();
  var typeSpeed = parseInt(ui.typeSpeedForm.okTypeSpeed.value, 10);

  if (typeof typeSpeed !== "number" || typeSpeed < 1) {
    typeSpeed = 4; //Default type speed
  }

  typeSpeed = Math.min(typeSpeed, 10);
  return myOnlyKey.setTypeSpeed(typeSpeed);
}

function submitLedBrightness(e) {
  e && e.preventDefault && e.preventDefault();
  var ledBrightness = parseInt(ui.ledBrightnessForm.okLedBrightness.value, 10);

  if (typeof ledBrightness !== "number" || ledBrightness < 1) {
    ledBrightness = 8; //Default led brightness
  }

  ledBrightness = Math.min(ledBrightness, 10);
  return myOnlyKey.setLedBrightness(ledBrightness);
}

function submitLockButton(e) {
  e && e.preventDefault && e.preventDefault();
  var lockButton = parseInt(ui.lockButtonForm.okLockButton.value, 10);

  if (typeof lockButton !== "number" || lockButton < 0 || lockButton > 6) {
    return;
  }

  lockButton = Math.min(lockButton, 10);
  return myOnlyKey.setLockButton(lockButton);
}

function submitKBDLayout(e) {
  e && e.preventDefault && e.preventDefault();
  var kbdLayout = parseInt(ui.keyboardLayoutForm.okKeyboardLayout.value, 10);

  if (typeof kbdLayout !== "number" || kbdLayout < 1) {
    kbdLayout = 1;
  }

  return myOnlyKey.setKBDLayout(kbdLayout);
}

function handleVersion(version) {
  myOnlyKey.setVersion(version);
  myOnlyKey.setDeviceType(version);
  setOkVersionStr();
}

function setOkVersionStr() {
  const version = myOnlyKey.getVersion();
  const deviceType = myOnlyKey.getDeviceType();
  let typeStr = "OnlyKey";
  if (deviceType !== DEVICE_TYPES.CLASSIC) {
    typeStr += ` ${deviceType.toUpperCase()}`;
  }

  if (version) {
    document.getElementById("fwVersion").innerText = `${typeStr} ${version}`;
  }
}

window.addEventListener("load", init);

function hexToModhex(inputStr, reverse) {
  // 0123 4567 89ab cdef
  // cbde fghi jkln rtuv
  // Example: hexadecimal number "4711" translates to "fibb"
  var hex = "0123456789abcdef";
  var modhex = "cbdefghijklnrtuv";
  var newStr = "";
  var o = reverse ? modhex : hex;
  var t = reverse ? hex : modhex;
  inputStr.split("").forEach(function (c) {
    var i = o.indexOf(c);
    if (i < 0) {
      throw new Error("Invalid character sent for hexToModhex conversion");
    }
    newStr += t.charAt(i);
  });

  return newStr;
}

function arraytoHexString(byteArray) {
  return Array.from(byteArray, function(byte) {
    return ('0' + (byte & 0xFF).toString(16)).slice(-2);
  }).join('')
}

function hexStringtoByteArray(hexString) {
  var result = [];
  for (var i = 0; i < hexString.length; i += 2) {
    result.push(parseInt(hexString.substr(i, 2), 16));
  }
  return result;
}

function strPad(str, places, char='0') {
  let s = str.toString();
  while (s.length < places) {
    s = `${char}${s}`;
  }
  return s;
}

// http://stackoverflow.com/questions/39460182/decode-base64-to-hexadecimal-string-with-javascript
function base64tohex(base64) {
  var raw = atob(base64);
  var HEX = "";
  var _hex;

  for (i = 0; i < raw.length; i++) {
    _hex = raw.charCodeAt(i).toString(16);
    HEX += _hex.length == 2 ? _hex : "0" + _hex;
  }
  return HEX.toUpperCase();
}

function parseBackupData(contents) {
  var newContents = [];
  // split by newline
  contents.split("\n").forEach(function (line) {
    if (line.indexOf("--") !== 0) {
      newContents.push(base64tohex(line));
    }
  });

  // join back to unified base64 string
  newContents = newContents.join("");
  return newContents;
}

function hexStrToDec(hexStr) {
  return new Number("0x" + hexStr).toString(10);
}

function byteToHex(value) {
  if (value < 16) return "0" + value.toString(16);
  return value.toString(16);
}

//nw.Window.get().on('new-win-policy', function(frame, url, policy) {
//  // do not open the window
//  policy.ignore();
//  // and open it in external browser
//  nw.Shell.openExternal(url);
//});
