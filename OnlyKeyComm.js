var OnlyKeyHID = function(onlyKeyConfigWizard) {
  var myOnlyKey = new OnlyKey();

  function OnlyKey() {
    this.deviceInfo = {
      vendorId: 5824,
      productId: 1158
    };
    this.maxInputReportSize = 64;
    this.maxOutputReportSize = 64;
    this.maxFeatureReportSize = 0;
    this.messageHeader = [ 255, 255, 255, 255 ];
    this.messages = {
      OKSETPIN      : 225, //0xE1
      OKSETSDPIN    : 226, //0xE2
      OKSETPDPIN    : 227, //0xE3
      OKSETTIME     : 228, //0xE4
      OKGETLABELS   : 229, //0xE5
      OKSETSLOT     : 230, //0xE6
      OKWIPESLOT    : 231, //0xE7
      OKSETU2FPRIV  : 232, //0xE8
      OKWIPEU2FPRIV : 233, //0xE9
      OKSETU2FCERT  : 234, //0xEA
      OKWIPEU2FCERT : 235, //0xEB
    };
    this.messageValues = {
      PASSWORD: 5
    };
    this.isReceivePending = false;
    this.pollEnabled = false;
    this.isInitialized = false;
    this.isLocked = true;
  }

  OnlyKey.prototype.setConnection = function (connectionId) {
    console.info("Setting connectionId to " + connectionId);
    this.connection = connectionId;
    if (connectionId === -1) {
      myOnlyKey = new OnlyKey();
      if (!ui.disconnected.open) {
        ui.disconnected.showModal();
      }
    } else {
      if (ui.disconnected.open) {
        ui.disconnected.close();
      }
      onlyKeyConfigWizard.init(myOnlyKey);
    }
  };

  OnlyKey.prototype.sendMessage = function(contents, msgId, slotId, valueId, callback) {
    var self = this;

    msgId = typeof msgId === 'string' ? msgId : null;
    slotId = typeof slotId === 'number' ? slotId : null;
    valueId = typeof valueId === 'string' ? valueId : null;
    contents = contents !== null ? contents : ui.outData.value;

    callback = typeof callback === 'function' ? callback : function noop(){};

    var reportId = 0; //+ui.outId.value
    var bytes = new Uint8Array(63); //new Uint8Array(+ui.outSize.value)
    var cursor = 0;

    for (; cursor < self.messageHeader.length; cursor++) {
      bytes[cursor] = self.messageHeader[cursor];
    }

    if (msgId && self.messages[msgId]) {
      bytes[cursor] = self.messages[msgId];
      cursor++;
    }

    if (valueId && self.messageValues[valueId]) {
      bytes[cursor] = self.messageValues[valueId];
      cursor++;
    }

    if (!Array.isArray(contents)) {
      contents = contents.replace(/\\x([a-fA-F0-9]{2})/g, function(match, capture) {
        return String.fromCharCode(parseInt(capture, 16));
      });

      for (var i = 0; i < contents.length && cursor < bytes.length; i++) {
        if (contents.charCodeAt(i) > 255) {
          throw "I am not smart enough to decode non-ASCII data.";
        }
        bytes[cursor++] = contents.charCodeAt(i);
      }
    } else {
      contents.forEach(function(val) {
        bytes[cursor++] = hexStrToDec(val);
      });
    }

    var pad = 0; //+ui.outPad.value
    for (; cursor < bytes.length;) {
      bytes[cursor++] = pad;
    }

    console.info("SENDING " + msgId + " to connectionId " + self.connection + ":", bytes);
    
    chrome.hid.send(self.connection, reportId, bytes.buffer, function() {
      if (chrome.runtime.lastError) {
        console.error("ERROR SENDING" + (msgId ? " " + msgId : "") + ":", chrome.runtime.lastError, { connectionId: self.connection });
        callback('ERROR SENDING PACKETS');
      } else {
        callback(null, 'OK');
      }
    });
  };

    //The next byte is the Message ID defined in the config packet document
    //If you dont have the doc in front of you here are the message IDs
    //#define OKSETPIN        (0xE1)  
    //#define OKSETTIME       (0xE2)  
    //#define OKGETLABELS     (0xE3)  
    //#define OKSETSLOT       (0xE4)   
    //#define OKWIPESLOT      (0xE5)  
    //#define OKSETU2FPRIV    (0xE6)  
    //#define OKWIPEU2FPRIV   (0xE7)   
    //#define OKSETU2FCERT    (0xE8)   
    //#define OKWIPEU2FCERT   (0xE9)  
    //#define OKSETYUBI       (0xEA)   
    //#define OKWIPEYUBI      (0xEB)   Last vendor defined command
    //bytes[4] = 228; //228 = E4 in decimal this is SETSLOT
    //The next byte is the slot number we have 12 slots to choose from
    //bytes[5] = 12; //slot 10 chosen
    //The next byte is the value number, each slot can store values like username, password, delay, additional characters etc.
    //bytes[6] = 5; //Value #5 is the password value
    //The next 32 bytes are the password you want to set, Just enter all 0s in the Report Contents field of the to send your password of 303030... (30 is ASCII for 0)
    
    
    //The code above is for OKSETSLOT the code below is for OKSETTIME
    //bytes[4] = 226; //226 = E2 in decimal this is SETTIME
    //The current time is 57081218 in hex see http://www.epochconverter.com/hex
    //bytes[5] = 87; //57 hex to decimal = 87
    //bytes[6] = 08; //08 hex to decimal = 08
    //bytes[7] = 18; //12 hex to decimal = 18
    //bytes[8] = 24; //18 hex to decimal = 24 

  OnlyKey.prototype.setTime = function (callback) {
    var currentEpochTime = Math.round(new Date().getTime()/1000.0).toString(16);
    console.info("Setting current epoch time =", currentEpochTime);
    var timeParts = currentEpochTime.match(/.{2}/g);
    this.sendMessage(timeParts, 'OKSETTIME', null, null, callback);
  };

  OnlyKey.prototype.sendSetPin = function (callback) {
    this.sendMessage('', 'OKSETPIN', null, null, callback);
  };
  
    OnlyKey.prototype.sendSetSDPin = function (callback) {
    this.sendMessage('', 'OKSETSDPIN', null, null, callback);
  };
  
     OnlyKey.prototype.sendSetPDPin = function (callback) {
    this.sendMessage('', 'OKSETPDPIN', null, null, callback);
  };

  var ui = {
    disconnected: null,
    slotConfigDialog: null,
    showSlotPanel: null,
    showInitPanel: null,
    initPanel: null,
    slotPanel: null,
    lockedDialog: null,
    main: null
  };

  var initializeWindow = function() {
    for (var k in ui) {
      var id = k.replace(/([A-Z])/g, '-$1').toLowerCase();
      var element = document.getElementById(id);
      if (!element) {
        throw "Missing UI element: " + k + ", " + id;
      }
      ui[k] = element;
    }

    ui.showSlotPanel.addEventListener('click', toggleConfigPanel);
    ui.showInitPanel.addEventListener('click', toggleConfigPanel);
    enableIOControls(false);
    enumerateDevices();
  };

  var enableIOControls = function(ioEnabled) {
    if (ioEnabled) {
        ui.main.classList.remove('hide');
    } else {
        ui.main.classList.add('hide');
    }

    closeSlotConfigForm();

    if (myOnlyKey.isInitialized) {
        if (!myOnlyKey.isLocked) {
            ui.slotPanel.classList.remove('hide');
            ui.initPanel.classList.add('hide');
            ui.showInitPanel.classList.add('hide');
            ui.showSlotPanel.classList.add('hide');
            ui.lockedDialog.classList.add('hide');
        } else {
            ui.showInitPanel.classList.remove('hide');
            ui.showSlotPanel.classList.remove('hide');
            ui.lockedDialog.classList.remove('hide');
        }
    } else {
        ui.slotPanel.classList.add('hide');
        ui.initPanel.classList.remove('hide');
        ui.lockedDialog.classList.add('hide');
        ui.showInitPanel.classList.add('hide');
        ui.showSlotPanel.classList.add('hide');
    }
  };

  var enumerateDevices = function() {
    chrome.hid.getDevices(myOnlyKey.deviceInfo, onDevicesEnumerated);
    chrome.hid.onDeviceAdded.addListener(onDeviceAdded);
    chrome.hid.onDeviceRemoved.addListener(onDeviceRemoved);
  };

  var onDevicesEnumerated = function(devices) {
    if (chrome.runtime.lastError) {
      console.error("onDevicesEnumerated ERROR:", chrome.runtime.lastError);
      return;
    }

    console.info("HID devices:", devices);

    for (var device of devices) {
      onDeviceAdded(device);
    }
  };

  var onDeviceAdded = function(device) {
    var optionId = 'device-' + device.deviceId;
    // auto connect desired device
    if (device.maxInputReportSize === myOnlyKey.maxInputReportSize &&
        device.maxOutputReportSize === myOnlyKey.maxOutputReportSize &&
        device.maxFeatureReportSize === myOnlyKey.maxFeatureReportSize) {
          connectDevice(device.deviceId);
    }
  };

  var connectDevice = function(deviceId) {
    console.info('CONNECTING deviceId:', deviceId);

    chrome.hid.connect(deviceId, function(connectInfo) {
      if (chrome.runtime.lastError) {
        console.error("ERROR CONNECTING:", chrome.runtime.lastError);
      } else if (!connectInfo) {
        console.warn("Unable to connect to device.");
      } else {
        console.info("CONNECTINFO:", connectInfo);
      }

      ui.disconnected.close();

      myOnlyKey.setConnection(connectInfo.connectionId);
      myOnlyKey.setTime(function (err, msg) {
          pollForInput();
      });
      enableIOControls(true);
    });
  };

  var onDeviceRemoved = function() {
    console.info("ONDEVICEREMOVED was triggered with connectionId", myOnlyKey.connection);
    if (myOnlyKey.connection === -1) return;

    chrome.hid.disconnect(myOnlyKey.connection, function() {
      if (chrome.runtime.lastError) {
        console.warn('DISCONNECT ERROR:', chrome.runtime.lastError);
      }

      console.info("DISCONNECTED CONNECTION", myOnlyKey.connection);
      myOnlyKey.setConnection(-1);
    });

    enableIOControls(false);
  };

  var pollForInput = function() {
    myOnlyKey.isReceivePending = true;
    chrome.hid.receive(myOnlyKey.connection, function(reportId, data) {
      if (chrome.runtime.lastError) {
        console.error("ERROR RECEIVING:", chrome.runtime.lastError);
      } else {
        var msg = new Uint8Array(data);
        readBytes(msg);
      }

      myOnlyKey.isReceivePending = false;
    });
  };

  var enablePolling = function(pollEnabled) {
    if (myOnlyKey.pollEnabled && !myOnlyKey.isReceivePending) {
      pollForInput();
    }
  };

  var byteToHex = function(value) {
    if (value < 16)
      return '0' + value.toString(16);
    return value.toString(16);
  };

  var hexStrToDec = function (hexStr) {
    return new Number('0x' + hexStr).toString(10);
  };

  var readBytes = function (bytes) {
    var msgStr = '';
    var msgBytes = new Uint8Array(bytes.buffer);

    for (var i = 0; i < msgBytes.length; i++) {
        if (msgBytes[i] > 31 && msgBytes[i] < 127)
            msgStr += String.fromCharCode(msgBytes[i]);
    }
    console.info("RECEIVED:", msgStr);

    handleMessage(msgStr);
    return msgStr;
  };

  var handleMessage = function (msg) {
    switch (msg) {
        case "UNINITIALIZED":
        case "INITIALIZED":
            myOnlyKey.isInitialized = (msg === "INITIALIZED");
            enableIOControls(true);
            break;
        default:
            break;
    }

    if (msg === "INITIALIZED") {
        pollForInput();
    }

    if (msg.toLowerCase().indexOf("unlocked") >= 0) {
        myOnlyKey.sendMessage('', 'OKGETLABELS', null, null, function (err, msg) {
            pollForInput();
        });
    }
  };

  function init() {
    console.info("OnlyKeyComm init() called");
    initializeWindow();
    myOnlyKey.setConnection(-1);
    initSlotConfigForm();
  }

    function toggleConfigPanel(e) {
        e.preventDefault();
        // "this" = element clicked
        if (this.id === "show-init-panel") {
            ui.initPanel.classList.remove('hide');
            ui.slotPanel.classList.add('hide');
        }

        if (this.id === 'show-slot-panel') {
            ui.slotPanel.classList.remove('hide');
            ui.initPanel.classList.add('hide');
        }
    }

  function initSlotConfigForm() {
    // TODO: loop through labels returned from OKGETLABELS
    var configBtns = Array.from(ui.slotPanel.getElementsByTagName('input'));
    configBtns.forEach(function (btn) {
        btn.addEventListener('click', showSlotConfigForm);
    });
    ui.slotConfigDialog.getElementsByClassName('slot-config-close')[0].addEventListener('click', closeSlotConfigForm);
  }

  function showSlotConfigForm(e) {
    e && e.preventDefault && e.preventDefault();

    var slotId = e.target.value;
    var slotLabel = document.getElementById('slotLabel' + slotId).innerText;
    ui.slotConfigDialog.getElementsByClassName('slotId')[0].innerText = slotId;

    document.getElementById('txtSlotLabel').value = slotLabel.toLowerCase() === 'empty' ? '' : slotLabel;
    ui.slotConfigDialog.showModal();
    return false;
  }

  function closeSlotConfigForm(e) {
    e && e.preventDefault && e.preventDefault();

    if (ui.slotConfigDialog.open) {
        ui.slotConfigDialog.close();
    }
  }

  window.addEventListener('load', init);
};
