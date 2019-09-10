/* eslint-disable arrow-parens */
/* eslint-disable no-plusplus */

const Message = {
  byteToHex: (value) => {
    if (value < 16) return `0${value.toString(16)}`;
    return value.toString(16);
  },

  hexStrToDec: (hexStr) => parseInt(parseInt(hexStr, 16).toString(10), 10),

  readBytes: (bytes) => {
    let msgStr = '';
    const msgBytes = new Uint8Array(bytes.buffer);

    for (let i = 0; i < msgBytes.length; i++) {
      if (msgBytes[i] > 31 && msgBytes[i] < 127) {
        msgStr += String.fromCharCode(msgBytes[i]);
      } else if (i === 0) {
        // if first byte is a hex, this is probably a slot number
        msgStr += Message.byteToHex(msgBytes[i]);
      }
    }

    return msgStr;
  },

  strPad: (string, places, char) => {
    let str = string;
    while (str.length < places) {
      str = `${(char || 0)}${str}`;
    }

    return str;
  },
};

Object.freeze(Message);

module.exports = Message;
