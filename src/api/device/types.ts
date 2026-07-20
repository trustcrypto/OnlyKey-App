export enum MessageID {
  OKSETPIN = 225,      // 0xE1
  OKSETSDPIN = 226,    // 0xE2
  OKSETPIN2 = 227,     // 0xE3
  OKSETTIME = 228,     // 0xE4
  OKGETLABELS = 229,   // 0xE5
  OKSETSLOT = 230,     // 0xE6
  OKWIPESLOT = 231,    // 0xE7
  OKGETPUBKEY = 236,   // 0xEC
  OKSIGN = 237,        // 0xED
  OKWIPEPRIV = 238,    // 0xEE
  OKSETPRIV = 239,     // 0xEF
  OKDECRYPT = 240,     // 0xF0
  OKRESTORE = 241,     // 0xF1
  OKFWUPDATE = 244     // 0xF4
}

export enum FieldID {
  LABEL = 1,
  URL = 15,
  NEXTKEY4 = 18,       // Before Username
  NEXTKEY1 = 16,       // After Username
  DELAY1 = 17,
  USERNAME = 2,
  NEXTKEY5 = 19,       // Before OTP
  NEXTKEY2 = 3,        // After Password
  DELAY2 = 4,
  PASSWORD = 5,
  NEXTKEY3 = 6,        // After OTP
  DELAY3 = 7,
  TFATYPE = 8,
  TFAUSERNAME = 9,
  YUBIAUTH = 10,
  YUBIANDHMAC = 29,
  LOCKOUT = 11,
  WIPEMODE = 12,
  BACKUPKEYMODE = 20,
  DERIVED_CHALLENGE_MODE = 21,
  STORED_CHALLENGE_MODE = 22,
  SEC_PROFILE_MODE = 23,
  TYPE_SPEED = 13,
  LED_BRIGHTNESS = 24,
  LOCK_BUTTON = 25,
  HMAC_CHALLENGE_MODE = 26,
  MODKEY_MODE = 27,
  KBD_LAYOUT = 14
}

export enum DeviceType {
  CLASSIC = 'classic',
  DUO = 'duo',
  UNKNOWN = 'unknown',
  BOOTLOADER = 'bootloader',
  UNINITIALIZED = 'uninitialized'
}

export interface SlotConfig {
  label: string;
  url: string;
  username: string;
  password?: string;
  totpSecret?: string;
  // Add other slot fields as needed
}

export const MESSAGE_HEADER = [255, 255, 255, 255]; // 0xFF FF FF FF
export const PACKET_SIZE = 64;
/** System-wide slot identifier used for global settings (legacy "XX" → 0). */
export const GLOBAL_SLOT = 0;
