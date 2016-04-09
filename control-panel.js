(function() {
  var ONLYKEY = {
    id: {
      vendorId: 5824,
      productId: 1158
    },
    maxInputReportSize: 64,
    maxOutputReportSize: 64,
    maxFeatureReportSize: 0,
    messageHeader: [ 255, 255, 255, 255 ],
    messages: {
      OKSETPIN      : 225, //0xE1
      OKSETTIME     : 226, //0xE2
      OKGETLABELS   : 227, //0xE3
      OKSETSLOT     : 228, //0xE4
      OKWIPESLOT    : 229, //0xE5
      OKSETU2FPRIV  : 230, //0xE6
      OKWIPEU2FPRIV : 231, //0xE7
      OKSETU2FCERT  : 232, //0xE8
      OKWIPEU2FCERT : 233, //0xE9
      OKSETYUBI     : 234, //0xEA
      OKWIPEYUBI    : 235 //0xEB
    },
    values: {
      PASSWORD: 5
    }
  };
    //The next byte is the Message ID defined in the config packet document
    //If you dont have the doc in front of you here are the message IDs
    //#define OKSETPIN       (0xE1)  
    //#define OKSETTIME       (0xE2)  
    //#define OKGETLABELS     (0xE3)  
    //#define OKSETSLOT       (0xE4)   
    //#define OKWIPESLOT      (0xE5)  
    //#define OKSETU2FPRIV    (0xE6)  
    //#define OKWIPEU2FPRIV     (0xE7)   
    //#define OKSETU2FCERT    (0xE8)   
    //#define OKWIPEU2FCERT     (0xE9)  
    //#define OKSETYUBI    (0xEA)   
    //#define OKWIPEYUBI     (0xEB)   Last vendor defined command
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

  var ui = {
    deviceSelector: null,
    connect: null,
    disconnect: null,
    addDevice: null,
    outId: null,
    outData: null,
    outSize: null,
    outPad: null,
    send: null,
    inSize: null,
    inPoll: null,
    inputLog: null,
    receive: null,
    clear: null
  };

  var connection = -1;
  var isReceivePending = false;

  var initializeWindow = function() {
    for (var k in ui) {
      var id = k.replace(/([A-Z])/, '-$1').toLowerCase();
      var element = document.getElementById(id);
      if (!element) {
        throw "Missing UI element: " + k;
      }
      ui[k] = element;
    }
    enableIOControls(false);
    ui.connect.addEventListener('click', onConnectClicked);
    ui.disconnect.addEventListener('click', onDisconnectClicked);
    ui.addDevice.addEventListener('click', onAddDeviceClicked);
    ui.send.addEventListener('click', onSend);
    ui.inPoll.addEventListener('change', onPollToggled);
    ui.receive.addEventListener('click', onReceiveClicked);
    ui.clear.addEventListener('click', onClearClicked);
    enumerateDevices();
  };

  var enableIOControls = function(ioEnabled) {
    ui.deviceSelector.disabled = ioEnabled;
    ui.connect.style.display = ioEnabled ? 'none' : 'inline';
    ui.disconnect.style.display = ioEnabled ? 'inline' : 'none';
    ui.inPoll.disabled = !ioEnabled;
    ui.send.disabled = !ioEnabled;
    ui.receive.disabled = !ioEnabled;
  };

  var enumerateDevices = function() {
    chrome.hid.getDevices(ONLYKEY.id, onDevicesEnumerated);
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
    if (ui.deviceSelector.namedItem(optionId)) {
      return;
    }

    var selectedIndex = ui.deviceSelector.selectedIndex;
    var option = document.createElement('option');
    option.text = "Device #" + device.deviceId + " [" +
                  device.vendorId.toString(16) + ":" +
                  device.productId.toString(16) + "]";
    option.id = optionId;
    ui.deviceSelector.options.add(option);
    if (selectedIndex != -1) {
      ui.deviceSelector.selectedIndex = selectedIndex;
    }

    // auto connect desired device
    if (device.maxInputReportSize === ONLYKEY.maxInputReportSize &&
        device.maxOutputReportSize === ONLYKEY.maxOutputReportSize &&
        device.maxFeatureReportSize === ONLYKEY.maxFeatureReportSize) {
          onConnectClicked(device.deviceId);
    }
  };

  var onDeviceRemoved = function(deviceId) {
    var option = ui.deviceSelector.options.namedItem('device-' + deviceId);
    if (!option) {
      return;
    }

    if (option.selected) {
      onDisconnectClicked();
    }
    ui.deviceSelector.remove(option.index);
  };

  var onConnectClicked = function(deviceId) {
    if (typeof deviceId !== 'number') {
      var selectedItem = ui.deviceSelector.options[ui.deviceSelector.selectedIndex];
      if (!selectedItem) {
        return;
      }

      deviceId = parseInt(selectedItem.id.substr('device-'.length), 10);
      if (!deviceId) {
        return;
      }
    }

    console.info('CONNECTING deviceId:', deviceId);

    chrome.hid.connect(deviceId, function(connectInfo) {
      if (chrome.runtime.lastError) {
        console.error("ERROR CONNECTING:", chrome.runtime.lastError);
      } else if (!connectInfo) {
        console.warn("Unable to connect to device.");
      } else {
        console.info("CONNECTINFO:", connectInfo);
      }

      connection = connectInfo.connectionId;
      var currentEpochTime = Math.round(new Date().getTime()/1000.0).toString(16);
      console.info("Setting current epoch time =", currentEpochTime);

      var timeParts = currentEpochTime.match(/.{2}/g);
      onSend(timeParts, 'OKSETTIME', null);
      enableIOControls(true);
    });
  };

  var onDisconnectClicked = function() {
    if (connection === -1) return;

    chrome.hid.disconnect(connection, function() {
      if (chrome.runtime.lastError) {
        console.warn('DISCONNECT ERROR:', chrome.runtime.lastError);
      }

      console.info("DISCONNECTED CONNECTION", connection);
      connection = -1;
    });

    enableIOControls(false);
  };

  var onAddDeviceClicked = function() {
    chrome.hid.getUserSelectedDevices({ 'multiple': false }, function(devices) {
      if (chrome.runtime.lastError != undefined) {
        console.warn('getUserSelectedDevices ERROR:', chrome.runtime.lastError);
        return;
      }
      for (var device of devices) {
        onDeviceAdded(device);
      }
    });
  };

  var onSend = function(contents, msgId, slotId, valueId) {
    if (msgId === undefined || slotId === undefined) {
      throw new Error('msgId and slotId are required. slotId can be null.');
      return;
    }

    var reportId = 0; //+ui.outId.value
    var bytes = new Uint8Array(63); //new Uint8Array(+ui.outSize.value
    var cursor = 0;
    var contents = contents || ui.outData.value;

    for (var i = 0; i < ONLYKEY.messageHeader.length; i++) {
      bytes[i] = ONLYKEY.messageHeader[i];
      cursor++;
    }

    if (msgId && ONLYKEY.messages[msgId]) {
      bytes[cursor] = ONLYKEY.messages[msgId];
      cursor++;
    }

    if (typeof valueId === 'number') {
      bytes[cursor] = valueId;
      cursor++;
    }

    if (!Array.isArray(contents)) {
      contents = contents.replace(/\\x([a-fA-F0-9]{2})/g, function(match, capture) {
        return String.fromCharCode(parseInt(capture, 16));
      });

      for (var i = cursor; i < contents.length && i < bytes.length; i++) {
        if (contents.charCodeAt(i) > 255) {
          throw "I am not smart enough to decode non-ASCII data.";
        }
        bytes[i] = contents.charCodeAt(i);
        cursor++;
      }
    } else {
      contents.forEach(function(val) {
        bytes[cursor] = hexStrToDec(val);
        cursor++;
      });
    }

    var pad = 0; //+ui.outPad.value
    for (var i = cursor; i < bytes.length; i++) {
      bytes[i] = pad;
    }
    ui.send.disabled = true;

    console.info("CONTENTS:", bytes);
    
    chrome.hid.send(connection, reportId, bytes.buffer, function() {
      if (chrome.runtime.lastError) {
        console.error("ERROR SENDING:", chrome.runtime.lastError);
      } else {
        console.info("SEND COMPLETE");
      }
      ui.send.disabled = false;
    });
  };

  var pollForInput = function() {
    var size = +ui.inSize.value;
    isReceivePending = true;
    chrome.hid.receive(connection, function(reportId, data) {
      if (chrome.runtime.lastError) {
        console.error("ERROR RECEIVING:", chrome.runtime.lastError);
      } else {
        var msg = new Uint8Array(data);
        logInput(msg);
        if (ui.inPoll.checked) {
          setTimeout(pollForInput, 0);
        }
      }

      isReceivePending = false;
    });
  };

  var enablePolling = function(pollEnabled) {
    ui.inPoll.checked = pollEnabled;
    if (pollEnabled && !isReceivePending) {
      pollForInput();
    }
  };

  var onPollToggled = function() {
    enablePolling(ui.inPoll.checked);
  };

  var onReceiveClicked = function() {
    enablePolling(false);
    if (!isReceivePending) {
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

  var logInput = function(bytes) {
    var log = '';
    for (var i = 0; i < bytes.length; i += 16) {
      var sliceLength = Math.min(bytes.length - i, 16);
      var lineBytes = new Uint8Array(bytes.buffer, i, sliceLength);
      for (var j = 0; j < lineBytes.length; ++j) {
        log += byteToHex(lineBytes[j]) + ' ';
      }
      for (var j = 0; j < lineBytes.length; ++j) {
        var ch = String.fromCharCode(lineBytes[j]);
        if (lineBytes[j] < 32 || lineBytes[j] > 126)
          ch = '.';
        log += ch;
      }
      log += '\n';
    }
    log += "================================================================\n";
    ui.inputLog.textContent += log;
    ui.inputLog.scrollTop = ui.inputLog.scrollHeight;
  };

  var onClearClicked = function() {
    ui.inputLog.textContent = "";
  };

  function init() {
    document.querySelector('.cp-toggle').onclick = toggleControlPanel;
    if (connection === -1) {
      initializeWindow();
    }
  }

  function toggleControlPanel() {
      // "this" = element clicked
      var wiz = { text: "Show Initial Setup Wizard", id: "wizard-panel" };
      var cp = { text: "Show Configuration", id: "control-panel" };

      switch (this.innerText) {
          case wiz.text:
              document.getElementById(cp.id).style.display = 'none';
              document.getElementById(wiz.id).style.display = 'block';
              this.innerText = cp.text;
              break;
          case cp.text:
              document.getElementById(wiz.id).style.display = 'none';
              document.getElementById(cp.id).style.display = 'block';
              this.innerText = wiz.text;
              break;
      }

      return false;
  }

  //window.addEventListener('load', initializeWindow);
  window.addEventListener('load', init);
}());
