/* eslint-disable no-console */
/* eslint-disable no-plusplus */
const HID = require('@trustcrypto/onlykey_usb');

const Message = require('../utils/Message');

class OK {
  constructor() {
    this.connectedDevice = null;

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
      received: [],
      sent: [],
    };
  }

  connect() {
    const ok = new HID.HID(0);
    if (!ok) {
      console.warn('Did not connect to an OnlyKey device.');
      return false;
    }

    console.dir({
      ok
    });

    this.connectedDevice = ok;
    this.setTime();

    ok.on('data', (data) => {
      const msg = Message.readBytes(new Uint8Array(data));
      console.dir({
        msg
      });
      this.handleMessage(msg);
    });

    ok.on('error', (data) => {
      const msg = Message.readBytes(new Uint8Array(data));
      const error = `[OK ERROR: ${msg}`;
      console.error(error);
    });

    return ok;
  }

  getLabels() {
    this.sendMessage({
      msgId: 'OKGETLABELS'
    });
  }

  getLastMessage(type) {
    let lastMessage = '';
    if (this.lastMessages && this.lastMessages[type] && this.lastMessages[type].length) {
      lastMessage = this.lastMessages[type][this.lastMessages[type].length - 1];
    }
    return lastMessage;
  }

  static getMessageType(msg = '') {
    // if second char of msg is a pipe, this is a label
    const msgParts = msg.split('|');
    let msgType = 'UNKNOWN';

    if (msgParts.length > 1) {
      msgType = 'LABELS';
    }

    if (msg.indexOf('UNLOCKED') === 0) {
      msgType = 'UNLOCKED';
    }

    if (msg.indexOf('INITIALIZED') === 0) {
      msgType = 'INITIALIZED';
    }

    if (msg.indexOf('UNINITIALIZED') === 0) {
      msgType = msg.includes('v') ? 'UPGRADE_NEEDED' : 'UNITIALIZED';
    }

    return msgType;
  }

  handleGetLabels(msg) {
    console.info(`handleGetLabels msg: ${msg}`);

    const msgParts = msg.split('|');
    const slotNum = parseInt(msgParts[0], 10);
    this.labels[slotNum - 1] = msgParts[1];
  }

  handleMessage(message) {
    const msg = message && typeof message === 'string' && message.trim();
    this.lastMessageReceived = msg;

    const msgType = OK.getMessageType(msg);
    switch (msgType) {
      case 'LABELS':
        this.handleGetLabels(msg);
        break;
      case 'UNLOCKED':
        this.getLabels();
        break;
      default:
        console.dir({
          msg
        });
        break;
    }

    return msg;
  }

  static get messageIds() {
    return {
      OKSETPIN: 225, // 0xE1
      OKSETSDPIN: 226, // 0xE2
      OKSETPDPIN: 227, // 0xE3
      OKSETTIME: 228, // 0xE4
      OKGETLABELS: 229, // 0xE5
      OKSETSLOT: 230, // 0xE6
      OKWIPESLOT: 231, // 0xE7
      OKSETU2FPRIV: 232, // 0xE8
      OKWIPEU2FPRIV: 233, // 0xE9
      OKSETU2FCERT: 234, // 0xEA
      OKWIPEU2FCERT: 235, // 0xEB
      OKGETPUBKEY: 236,
      OKSIGN: 237,
      OKWIPEPRIV: 238,
      OKSETPRIV: 239,
      OKDECRYPT: 240,
      OKRESTORE: 241,
      OKFWUPDATE: 244,
    };
  }

  static get messageFields() {
    return {
      LABEL: 1,
      URL: 15,
      NEXTKEY4: 18, // Before Username
      NEXTKEY1: 16, // After Username
      DELAY1: 17,
      USERNAME: 2,
      NEXTKEY5: 19, // Before OTP
      NEXTKEY2: 3, // After Password
      DELAY2: 4,
      PASSWORD: 5,
      NEXTKEY3: 6, // After OTP
      DELAY3: 7,
      TFATYPE: 8,
      TFAUSERNAME: 9,
      YUBIAUTH: 10,
      LOCKOUT: 11,
      WIPEMODE: 12,
      BACKUPKEYMODE: 20,
      SSHCHALLENGEMODE: 21,
      PGPCHALLENGEMODE: 22,
      SECPROFILEMODE: 23,
      TYPESPEED: 13,
      KBDLAYOUT: 14,
    };
  }

  static get messageHeader() {
    return [255, 255, 255, 255];
  }

  get lastMessageReceived() {
    return this.getLastMessage('received');
  }

  /**
   * @param {string} msgStr
   */
  set lastMessageReceived(msgStr = '') {
    return this.setLastMessage('received', msgStr);
  }

  get lastMessageSent() {
    return this.getLastMessage('sent');
  }

  /**
   * @param {string} msgStr
   */
  set lastMessageSent(msgStr = '') {
    return this.setLastMessage('sent', msgStr);
  }

  sendMessage(options) {
    const bytesPerMessage = 64;

    const msgId = typeof options.msgId === 'string' ? options.msgId.toUpperCase() : null;
    const slotId = typeof options.slotId === 'number' || typeof options.slotId === 'string' ? options.slotId : null;
    const fieldId = typeof options.fieldId === 'string' || typeof options.fieldId === 'number' ? options.fieldId : null;
    const contentType = (options.contentType && options.contentType.toUpperCase()) || 'HEX';
    const bytes = new Uint8Array(bytesPerMessage);

    let contents = typeof options.contents === 'number' || (options.contents && options.contents.length) ? options.contents : '';
    let cursor = 0;

    for (; cursor < OK.messageHeader.length; cursor++) {
      bytes[cursor] = OK.messageHeader[cursor];
    }

    if (msgId && OK.messageIds[msgId]) {
      bytes[cursor] = Message.strPad(OK.messageIds[msgId], 2, 0);
      cursor++;
    }

    if (slotId !== null) {
      bytes[cursor] = Message.strPad(slotId, 2, 0);
      cursor++;
    }

    if (fieldId !== null) {
      if (this.messageFields[fieldId]) {
        bytes[cursor] = Message.strPad(this.messageFields[fieldId], 2, 0);
      } else {
        bytes[cursor] = fieldId;
      }

      cursor++;
    }

    if (Array.isArray(contents)) {
      contents.forEach(val => bytes[cursor++] = contentType === 'HEX' ? Message.hexStrToDec(val) : val);
    } else {
      switch (typeof contents) {
        case 'string':
          contents = contents.replace(/\\x([a-fA-F0-9]{2})/g, (match, capture) => {
            return String.fromCharCode(parseInt(capture, 16));
          });

          for (let i = 0; i < contents.length && cursor < bytes.length; i++) {
            if (contents.charCodeAt(i) > 255) {
              throw "I am not smart enough to decode non-ASCII data.";
            }
            bytes[cursor++] = contents.charCodeAt(i);
          }
          break;
        case 'number':
          if (contents < 0 || contents > 255) {
            throw "Byte value out of bounds.";
          }
          bytes[cursor++] = contents;
          break;
      }
    }

    const pad = 0;
    for (; cursor < bytes.length;) {
      bytes[cursor++] = pad;
    }

    console.info(`SENDING ${msgId} to connectionId ${this.connectedDevice}:`, bytes);

    const bytesWritten = this.connectedDevice.write(bytes);
    console.dir({
      bytesWritten
    });
    this.setLastMessage('sent', msgId);
  }

  setLastMessage(type = '', msgStr = '') {
    const numberToKeep = 3;
    let msgSuccessful = false;

    if (msgStr) {
      const newMessage = {
        text: msgStr,
        timestamp: new Date().getTime(),
      };

      let messages = this.lastMessages[type] || [];
      if (messages.length === numberToKeep) {
        messages.slice(numberToKeep - 1);
      }

      messages = [newMessage].concat(messages);
      this.lastMessages[type] = messages;
      msgSuccessful = true;
    }

    return msgSuccessful;
  }

  setTime() {
    const currentEpochTime = Math.round(new Date().getTime() / 1000.0).toString(16);
    console.info('Setting current epoch time =', currentEpochTime);
    const timeParts = currentEpochTime.match(/.{2}/g);

    this.sendMessage({
      contents: timeParts,
      // contentType: 'HEX',
      msgId: 'OKSETTIME',
    });
  }

  static logCurrentByte(byte) {
    console.dir({
      [byte]: typeof byte,
    });
  }

  static get SUPPORTED_DEVICES() {
    return [{
        vendorId: 5824, // OnlyKey firmware before Beta 7
        productId: 1158,
        maxInputReportSize: 64,
        maxOutputReportSize: 64,
        maxFeatureReportSize: 0,
      },
      {
        vendorId: 7504, // OnlyKey firmware Beta 7+ http://www.linux-usb.org/usb.ids
        productId: 24828,
        maxInputReportSize: 64,
        maxOutputReportSize: 64,
        maxFeatureReportSize: 0,
      },
      {
        vendorId: 0, // Black Vault Labs Bootloaderv1
        productId: 45057,
        maxInputReportSize: 64,
        maxOutputReportSize: 64,
        maxFeatureReportSize: 0,
      },
    ];
  }
}

Object.freeze(OK);

module.exports = OK;
