var OnlyKeyHID = function (onlyKeyConfigWizard) {
    var myOnlyKey = new OnlyKey();
    var dialog = new dialogMgr();

    function OnlyKey() {
        this.deviceInfo = {
            vendorId: 5824,
            productId: 1158
        };
        this.maxInputReportSize = 64;
        this.maxOutputReportSize = 64;
        this.maxFeatureReportSize = 0;
        this.messageHeader = [255, 255, 255, 255];
        this.messages = {
            OKSETPIN: 225, //0xE1
            OKSETSDPIN: 226, //0xE2
            OKSETPDPIN: 227, //0xE3
            OKSETTIME: 228, //0xE4
            OKGETLABELS: 229, //0xE5
            OKSETSLOT: 230, //0xE6
            OKWIPESLOT: 231, //0xE7
            OKSETU2FPRIV: 232, //0xE8
            OKWIPEU2FPRIV: 233, //0xE9
            OKSETU2FCERT: 234, //0xEA
            OKWIPEU2FCERT: 235, //0xEB
        };
        this.messageFields = {
            LABEL: 1,
            USERNAME: 2,
            NEXTKEY1: 3,
            DELAY1: 4,
            PASSWORD: 5,
            NEXTKEY2: 6,
            DELAY2: 7,
            TFATYPE: 8,
            TFAUSERNAME: 9,
            YUBIAUTH: 10,
            LOCKOUT: 11
        };
        this.connection = -1;
        this.isReceivePending = false;
        this.pollEnabled = false;
        this.isInitialized = false;
        this.isLocked = true;
        this.lastMessages = {
            sent: [],
            received: []
        };
        this.currentSlotId = null;
        this.labels = [];
    }

    OnlyKey.prototype.setConnection = function (connectionId) {
        console.info("Setting connectionId to " + connectionId);
        this.connection = connectionId;
        if (connectionId === -1) {
            myOnlyKey = new OnlyKey();
            dialog.open(ui.disconnectedDialog);
        } else {
            dialog.open(ui.workingDialog);
            onlyKeyConfigWizard.init(myOnlyKey);
        }
    };

    OnlyKey.prototype.sendMessage = function (contents, msgId, slotId, fieldId, callback) {
        var self = this;
        var bytesPerMessage = 64;

        msgId = typeof msgId === 'string' ? msgId.toUpperCase() : null;
        slotId = typeof slotId === 'number' ? slotId : null;
        fieldId = typeof fieldId === 'string' ? fieldId : null;
        contents = contents || '';

        callback = typeof callback === 'function' ? callback : handleMessage;

        var reportId = 0;
        var bytes = new Uint8Array(bytesPerMessage);
        var cursor = 0;

        for (; cursor < self.messageHeader.length; cursor++) {
            bytes[cursor] = self.messageHeader[cursor];
        }

        if (msgId && self.messages[msgId]) {
            bytes[cursor] = strPad(self.messages[msgId], 2, 0);
            cursor++;
        }

        if (slotId !== null) {
            bytes[cursor] = strPad(slotId, 2, 0);
            cursor++;
        }

        if (fieldId && self.messageFields[fieldId]) {
            bytes[cursor] = strPad(self.messageFields[fieldId], 2, 0);
            cursor++;
        }

        if (!Array.isArray(contents)) {
            contents = contents.replace(/\\x([a-fA-F0-9]{2})/g, function (match, capture) {
                return String.fromCharCode(parseInt(capture, 16));
            });

            for (var i = 0; i < contents.length && cursor < bytes.length; i++) {
                if (contents.charCodeAt(i) > 255) {
                    throw "I am not smart enough to decode non-ASCII data.";
                }
                bytes[cursor++] = contents.charCodeAt(i);
            }
        } else {
            contents.forEach(function (val) {
                bytes[cursor++] = hexStrToDec(val);
            });
        }

        var pad = 0;
        for (;cursor < bytes.length;) {
            bytes[cursor++] = pad;
        }

        console.info("SENDING " + msgId + " to connectionId " + self.connection + ":", bytes);

        chrome.hid.send(self.connection, reportId, bytes.buffer, function () {
            if (chrome.runtime.lastError) {
                console.error("ERROR SENDING" + (msgId ? " " + msgId : "") + ":", chrome.runtime.lastError, { connectionId: self.connection });
                callback('ERROR SENDING PACKETS');
            } else {
                myOnlyKey.setLastMessage('sent', msgId);
                callback(null, 'OK');
            }
        });
    };

    OnlyKey.prototype.setLastMessage = function (type, msgStr) {
        if (msgStr) {
            var newMessage = { text: msgStr, timestamp: new Date().getTime() };
            var messages = this.lastMessages[type] || [];
            var numberToKeep = 3;
            if (messages.length === numberToKeep) {
                messages.slice(numberToKeep - 1);
            }
            messages = [newMessage].concat(messages);
            this.lastMessages[type] = messages;
            if (type === 'received' && onlyKeyConfigWizard) {
                onlyKeyConfigWizard.setLastMessages(messages);
            }
        }
    };

    OnlyKey.prototype.getLastMessage = function (type) {
        return this.lastMessages[type] && this.lastMessages[type][0] && this.lastMessages[type][0].hasOwnProperty('text') ? this.lastMessages[type][0].text : '';

    };

    OnlyKey.prototype.listen = function (callback) {
        pollForInput(callback);
    };

    OnlyKey.prototype.setTime = function (callback) {
        var currentEpochTime = Math.round(new Date().getTime() / 1000.0).toString(16);
        console.info("Setting current epoch time =", currentEpochTime);
        var timeParts = currentEpochTime.match(/.{2}/g);
        this.sendMessage(timeParts, 'OKSETTIME', null, null, callback);
    };

    OnlyKey.prototype.getLabels = function (callback) {
        this.labels = 'GETTING';
        this.sendMessage('', 'OKGETLABELS', null, null, handleGetLabels);
    };

    function handleGetLabels(err, msg) {
        msg = typeof msg === 'string' ? msg.trim() : '';
        console.info("HandleGetLabels msg:", msg);
        if (myOnlyKey.getLastMessage('sent') !== 'OKGETLABELS') {
            return;
        }

        if (myOnlyKey.labels === 'GETTING') {
            myOnlyKey.labels = [];
            return myOnlyKey.listen(handleGetLabels);
        }

        if (msg.indexOf('|') < 0) {
            myOnlyKey.listen(handleGetLabels);
        } else {
            if (myOnlyKey.labels.length < 12) {
                var msgParts = msg.split('|');
                myOnlyKey.labels.push(msg.indexOf('|') >= 0 ? msgParts[1] : msg);
                myOnlyKey.setLastMessage('received', myOnlyKey.labels.length + ' labels');
                initSlotConfigForm();
                if (myOnlyKey.labels.length < 12) {
                    myOnlyKey.listen(handleGetLabels);
                }
            }
        }
    }

    OnlyKey.prototype.sendSetPin = function (callback) {
        this.sendMessage('', 'OKSETPIN', null, null, function (err, msg) {
            pollForInput(callback);
        }.bind(this));
    };

    OnlyKey.prototype.sendSetSDPin = function (callback) {
        this.sendMessage('', 'OKSETSDPIN', null, null, function (err, msg) {
            pollForInput(callback);
        }.bind(this));
    };

    OnlyKey.prototype.sendSetPDPin = function (callback) {
        this.sendMessage('', 'OKSETPDPIN', null, null, function (err, msg) {
            pollForInput(callback);
        }.bind(this));
    };

    OnlyKey.prototype.setSlot = function (slot, field, value, callback) {
        slot = slot || this.getSlotNum();
        if (typeof slot !== 'number') slot = this.getSlotNum(slot);
        this.sendMessage(value, 'OKSETSLOT', slot, field, callback);
    };

    OnlyKey.prototype.wipeSlot = function (slot, field, callback) {
        slot = slot || this.getSlotNum();
        if (typeof slot !== 'number') slot = this.getSlotNum(slot);
        this.sendMessage(null, 'OKWIPESLOT', slot, field || null, callback);
    };

    OnlyKey.prototype.getSlotNum = function (slotId) {
        slotId = slotId || this.currentSlotId;
        var parts = slotId.split('');
        return parseInt(parts[0], 10) + (parts[1].toLowerCase() === 'a' ? 0 : 6);
    };

    OnlyKey.prototype.setYubiAuth = function (publicId, privateId, secretKey, callback) {
        this.setSlot('XX', 'YUBIAUTH', (publicId+privateId+secretKey).match(/.{2}/g), callback);
    };

    OnlyKey.prototype.wipeYubiAuth = function (callback) {
        this.wipeSlot('XX', 'YUBIAUTH', callback);
    };

    OnlyKey.prototype.setU2fPrivateId = function (privateId, callback) {
        if (privateId.length) {
            privateId = privateId.match(/.{2}/g);
            this.sendMessage(privateId, 'OKSETU2FPRIV', null, null, callback);
        } else {
            callback();
        }
    };

    OnlyKey.prototype.wipeU2fPrivateId = function (callback) {
        this.sendMessage(null, 'OKWIPEU2FPRIV', null, null, callback);
    };

    OnlyKey.prototype.setU2fCert = function (cert, packetHeader, callback) {
        var msg = [ packetHeader ];
        msg = msg.concat(cert.match(/.{2}/g));
        this.sendMessage(msg, 'OKSETU2FCERT', null, null, callback);
    };

    OnlyKey.prototype.wipeU2fCert = function (callback) {
        this.sendMessage(null, 'OKWIPEU2FCERT', null, null, callback);
    };

    OnlyKey.prototype.setLockout = function (lockout, callback) {
        this.setSlot('XX', 'LOCKOUT', lockout, callback);
    };

    var ui = {
        showSlotPanel: null,
        showInitPanel: null,
        initPanel: null,
        slotPanel: null,
        slotConfigBtns: null,
        lockedDialog: null,
        slotConfigDialog: null,
        workingDialog: null,
        disconnectedDialog: null,
        main: null
    };

    var initializeWindow = function () {
        for (var k in ui) {
            var id = k.replace(/([A-Z])/g, '-$1').toLowerCase();
            var element = document.getElementById(id);
            if (!element) {
                throw "Missing UI element: " + k + ", " + id;
            }
            ui[k] = element;
        }

        ui.yubiAuthForm = document['yubiAuthForm'];
        ui.u2fAuthForm = document['u2fAuthForm'];
        ui.lockoutForm = document['lockoutForm'];

        ui.showSlotPanel.addEventListener('click', toggleConfigPanel);
        ui.showInitPanel.addEventListener('click', toggleConfigPanel);

        enableIOControls(false);
        enableAuthForms();
        enumerateDevices();
    };

    var enableIOControls = function (ioEnabled) {
        closeSlotConfigForm();

        if (!ioEnabled) {
            ui.main.classList.add('hide');
            if (myOnlyKey.connection === -1) {
                dialog.open(ui.disconnectedDialog);
            }
        }

        if (myOnlyKey.isInitialized) {
            if (myOnlyKey.isLocked) {
                dialog.open(ui.lockedDialog);
            } else {
                ui.main.classList.remove('hide');
                ui.slotPanel.classList.remove('hide');
                ui.initPanel.classList.add('hide');
                ui.showInitPanel.classList.remove('hide');
                ui.showSlotPanel.classList.remove('hide');
                dialog.close(ui.lockedDialog);
            }
        } else {
            ui.main.classList.remove('hide');
            ui.slotPanel.classList.add('hide');
            ui.initPanel.classList.remove('hide');
            ui.showInitPanel.classList.add('hide');
            ui.showSlotPanel.classList.add('hide');
            dialog.close(ui.lockedDialog);
        }
    };

    var enumerateDevices = function () {
        chrome.hid.getDevices(myOnlyKey.deviceInfo, onDevicesEnumerated);
        chrome.hid.onDeviceAdded.addListener(onDeviceAdded);
        chrome.hid.onDeviceRemoved.addListener(onDeviceRemoved);
    };

    var onDevicesEnumerated = function (devices) {
        if (chrome.runtime.lastError) {
            console.error("onDevicesEnumerated ERROR:", chrome.runtime.lastError);
            return;
        }

        console.info("HID devices:", devices);

        for (var device of devices) {
            onDeviceAdded(device);
        }
    };

    var onDeviceAdded = function (device) {
        var optionId = 'device-' + device.deviceId;
        // auto connect desired device
        if (device.maxInputReportSize === myOnlyKey.maxInputReportSize &&
            device.maxOutputReportSize === myOnlyKey.maxOutputReportSize &&
            device.maxFeatureReportSize === myOnlyKey.maxFeatureReportSize) {
            connectDevice(device.deviceId);
        }
    };

    var connectDevice = function (deviceId) {
        console.info('CONNECTING deviceId:', deviceId);

        dialog.close(ui.disconnectedDialog);
        dialog.open(ui.workingDialog);

        chrome.hid.connect(deviceId, function (connectInfo) {
            if (chrome.runtime.lastError) {
                console.error("ERROR CONNECTING:", chrome.runtime.lastError);
            } else if (!connectInfo) {
                console.warn("Unable to connect to device.");
            } else {
                console.info("CONNECTINFO:", connectInfo);
            }

            myOnlyKey.setConnection(connectInfo.connectionId);
            myOnlyKey.setTime(pollForInput);
            enableIOControls(true);
        });
    };

    var onDeviceRemoved = function () {
        console.info("ONDEVICEREMOVED was triggered with connectionId", myOnlyKey.connection);
        if (myOnlyKey.connection === -1) return;

        chrome.hid.disconnect(myOnlyKey.connection, function () {
            if (chrome.runtime.lastError) {
                console.warn('DISCONNECT ERROR:', chrome.runtime.lastError);
            }

            console.info("DISCONNECTED CONNECTION", myOnlyKey.connection);
            myOnlyKey.setConnection(-1);
            myOnlyKey.setLastMessage('received', 'Disconnected');
            onlyKeyConfigWizard.initForm.reset();
        });

        enableIOControls(false);
    };

    var pollForInput = function (callback) {
        console.info("Polling...");
        clearTimeout(myOnlyKey.poll);
        callback = callback || handleMessage;

        var msg;
        chrome.hid.receive(myOnlyKey.connection, function (reportId, data) {
            if (chrome.runtime.lastError) {
                myOnlyKey.setLastMessage('received', '[error]');
                return callback(chrome.runtime.lastError);
            } else {
                msg = readBytes(new Uint8Array(data));
            }

            console.info("RECEIVED:", msg);
    
            if (myOnlyKey.pollEnabled) {
                myOnlyKey.poll = setTimeout(pollForInput, 0);
            }

            if (msg.length > 1 && msg !== 'OK') {
                myOnlyKey.setLastMessage('received', msg);
            }

            // if message begins with Error, call callback with msg as err
            // and the last sent message as 2nd arg
            if (msg.indexOf("Error") === 0) {
                return callback(msg, myOnlyKey.getLastMessage('sent'));
            }

            // else call callback with null err and msg as 2nd arg
            return callback(null, msg);
        });
    };

    var readBytes = function (bytes) {
        var msgStr = '';
        var msgBytes = new Uint8Array(bytes.buffer);

        for (var i = 0; i < msgBytes.length; i++) {
            if (msgBytes[i] > 31 && msgBytes[i] < 127)
                msgStr += String.fromCharCode(msgBytes[i]);
        }

        return msgStr;
    };

    var handleMessage = function (err, msg) {
        if (err) {
            return console.error("MESSAGE ERROR:", err);
        }

        var msg = msg.trim();
        var updateUI = false;
        dialog.close(ui.workingDialog);

        switch (msg) {
            case "UNINITIALIZED":
            case "INITIALIZED":
                myOnlyKey.isInitialized = (msg === "INITIALIZED");
                updateUI = true;
                break;
            default:
                break;
        }

        if (msg === "INITIALIZED" && !myOnlyKey.pollEnabled) { // OK should still be locked
            pollForInput();
        }

        if (msg.indexOf("UNLOCKED") >= 0) {
            myOnlyKey.isInitialized = true;
            if (myOnlyKey.isLocked) {
                myOnlyKey.isLocked = false;
                myOnlyKey.getLabels(pollForInput);
                updateUI = true;
            }
        } else if (msg.indexOf("LOCKED") >= 0) {
            myOnlyKey.isLocked = true;
        }

        if (updateUI) {
            enableIOControls(true);
        }
    };

    var enablePolling = function () {
        myOnlyKey.pollEnabled = true;
        pollForInput();
    };

    function init() {
        console.info("OnlyKeyComm init() called");
        initializeWindow();
        myOnlyKey.setConnection(-1);
    }

    function toggleConfigPanel(e) {
        // "this" = element clicked
        if (this.id === "show-init-panel") {
            ui.initPanel.classList.remove('hide');
            ui.slotPanel.classList.add('hide');
        }

        if (this.id === 'show-slot-panel') {
            ui.slotPanel.classList.remove('hide');
            ui.initPanel.classList.add('hide');
        }

        e && e.preventDefault && e.preventDefault();
    }

    function initSlotConfigForm() {
        // TODO: loop through labels returned from OKGETLABELS
        var configBtns = Array.from(ui.slotConfigBtns.getElementsByTagName('input'));
        configBtns.forEach(function (btn, i) {
            var labelIndex = myOnlyKey.getSlotNum(btn.value);
            var labelText = myOnlyKey.labels[labelIndex - 1] || 'empty';
            onlyKeyConfigWizard.setSlotLabel(i, labelText);
            btn.addEventListener('click', showSlotConfigForm);
        });
        ui.slotConfigDialog.getElementsByClassName('slot-config-close')[0].addEventListener('click', closeSlotConfigForm);
    }

    function showSlotConfigForm(e) {
        var slotId = e.target.value;
        myOnlyKey.currentSlotId = slotId;
        var slotLabel = document.getElementById('slotLabel' + slotId).innerText;
        ui.slotConfigDialog.getElementsByClassName('slotId')[0].innerText = slotId;

        document.getElementById('txtSlotLabel').value = slotLabel.toLowerCase() === 'empty' ? '' : slotLabel;
        dialog.open(ui.slotConfigDialog);
        initSlotConfigForm();
        e && e.preventDefault && e.preventDefault();
    }

    function closeSlotConfigForm(e) {
        dialog.close(ui.slotConfigDialog);
        e && e.preventDefault && e.preventDefault();
    }

    function enableAuthForms() {
        var yubiSubmit = document.getElementById('yubiSubmit');
        var yubiWipe = document.getElementById('yubiWipe');
        yubiSubmit.addEventListener('click', submitYubiAuthForm);
        yubiWipe.addEventListener('click', wipeYubiAuthForm);

        var u2fSubmit = document.getElementById('u2fSubmit');
        var u2fWipe = document.getElementById('u2fWipe');
        u2fSubmit.addEventListener('click', submitU2fAuthForm);
        u2fWipe.addEventListener('click', wipeU2fAuthForm);

        var lockoutSubmit = document.getElementById('lockoutSubmit');
        lockoutSubmit.addEventListener('click', submitLockoutForm);
    }

    function submitYubiAuthForm(e) {
        var publicId = ui.yubiAuthForm.yubiPublicId.value || '';
        var privateId = ui.yubiAuthForm.yubiPrivateId.value || '';
        var secretKey = ui.yubiAuthForm.yubiSecretKey.value || '';

        publicId = publicId.toString().replace(/\s/g,'');
        privateId = privateId.toString().replace(/\s/g,'');
        secretKey = secretKey.toString().replace(/\s/g,'');

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

    function submitU2fAuthForm(e) {
        var privateId = ui.u2fAuthForm.u2fPrivateId.value || '';
        var cert = ui.u2fAuthForm.u2fCert.value || '';

        privateId = privateId.toString().replace(/\s/g,'');
        cert = cert.toString().replace(/\s/g,'');

        // going to be mean and only send the max chars allowed
        var maxPrivateIdLength = 64; // 32 bytes
        var maxCertLength = 2048; // 1024 bytes
        privateId = privateId.slice(0, maxPrivateIdLength);
        cert = cert.slice(0, maxCertLength);

        // TODO: validation
        myOnlyKey.setU2fPrivateId(privateId, function (err) {
            submitU2fCert(cert, function (err) {
                // TODO: check for success, then reset
                ui.u2fAuthForm.reset();
            });
        });

        e && e.preventDefault && e.preventDefault();
    }

    function submitU2fCert(certStr, callback) {
        // this function should recursively call itself until all bytes are sent
        // in chunks of 58
        if (!certStr.length) {
            return callback();
        }
        var maxPacketSize = 116; // 58 bytes
        var finalPacket = certStr.length - maxPacketSize <= 0;

        var cb = finalPacket ? callback : submitU2fCert.bind(null, certStr.slice(maxPacketSize), callback);
        // packetHeader is hex number of bytes in certStr chunk
        // what if certStr.length is odd?
        var packetHeader = finalPacket ? (certStr.length / 2).toString(16) : "FF";
        myOnlyKey.setU2fCert(certStr.slice(0, maxPacketSize), packetHeader, cb);
    }

    function wipeU2fAuthForm(e) {
        myOnlyKey.wipeU2fPrivateId(function (err) {
            myOnlyKey.wipeU2fCert();
        });

        e && e.preventDefault && e.preventDefault();
    }

    function submitLockoutForm(e) {
        var lockout = ui.lockoutForm.okLockout.value || 15;

        if (!lockout || typeof lockout !== 'number' || lockout < 0) {
            lockout = 15;
        }
        if (lockout > 255) {
            lockout = 255;
        }

        myOnlyKey.setLockout(lockout.toString(), function (err) {
            ui.lockoutForm.reset();
        });

        e && e.preventDefault && e.preventDefault();
    }

    window.addEventListener('load', init);
};


function hexToModhex(inputStr, reverse) {
    // 0123 4567 89ab cdef
    // cbde fghi jkln rtuv
    // Example: hexadecimal number "4711" translates to "fibb"
    var hex     = '0123456789abcdef';
    var modhex  = 'cbdefghijklnrtuv';
    var newStr  = '';
    var o = reverse ? modhex : hex;
    var t = reverse ? hex : modhex;
    inputStr.split('').forEach(function (c) {
        var i = o.indexOf(c);
        if (i < 0) {
            throw new Error('Invalid character sent for hexToModhex conversion');
        }
        newStr += t.charAt(i);
    });

    console.info(inputStr, 'converted to', newStr);
    return newStr;
}

function strPad(str, places, char) {
    while (str.length < places) {
        str = "" + (char || 0) + str;
    }

    return str;
}

// we owe russ a beer
// http://blog.tinisles.com/2011/10/google-authenticator-one-time-password-algorithm-in-javascript/
function base32tohex(base32) {
    var base32chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    var bits = "";
    var hex = "";

    for (var i = 0; i < base32.length; i++) {
        var val = base32chars.indexOf(base32.charAt(i).toUpperCase());
        bits += strPad(val.toString(2), 5, '0');
    }

    for (var i = 0; i+4 <= bits.length; i+=4) {
        var chunk = bits.substr(i, 4);
        hex = hex + parseInt(chunk, 2).toString(16) ;
    }
    return hex;

}

function hexStrToDec(hexStr) {
    return new Number('0x' + hexStr).toString(10);
}

function byteToHex(value) {
    if (value < 16)
        return '0' + value.toString(16);
    return value.toString(16);
}
