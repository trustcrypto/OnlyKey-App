import { DeviceType } from './types';

/**
 * Device behavior constants sourced from OnlyKey-Firmware (keylayouts.h, OnlyKey.ino)
 * and trustcrypto/libraries onlykey/okcore.cpp.
 */

/** Values from keylayouts.h / v5 app keyboardLayoutForm (okKeyboardLayout). */
export const KEYBOARD_LAYOUTS = [
  { value: 0x01, label: 'US English (default)' },
  { value: 0x02, label: 'Canadian French' },
  { value: 0x03, label: 'Canadian Multilingual' },
  { value: 0x04, label: 'Danish' },
  { value: 0x1b, label: 'Danish Mac' },
  { value: 0x05, label: 'Finnish' },
  { value: 0x06, label: 'French' },
  { value: 0x07, label: 'French Belgian' },
  { value: 0x08, label: 'French Swiss' },
  { value: 0x09, label: 'German' },
  { value: 0x0a, label: 'German Mac' },
  { value: 0x0b, label: 'German Swiss' },
  { value: 0x0c, label: 'Icelandic' },
  { value: 0x0d, label: 'Irish' },
  { value: 0x0e, label: 'Italian' },
  { value: 0x0f, label: 'Norwegian' },
  { value: 0x10, label: 'Portuguese' },
  { value: 0x11, label: 'Portuguese Brazilian' },
  { value: 0x12, label: 'Spanish' },
  { value: 0x13, label: 'Spanish Latin America' },
  { value: 0x14, label: 'Swedish' },
  { value: 0x15, label: 'Turkish' },
  { value: 0x16, label: 'United Kingdom' },
  { value: 0x17, label: 'US International' },
  { value: 0x18, label: 'Czech' },
  { value: 0x19, label: 'Serbian Latin Only' },
  { value: 0x1a, label: 'Hungarian' },
  { value: 0x1c, label: 'Dvorak' },
] as const;

/** Legacy keyboard layout option labels for the preferences dropdown. */
export const KEYBOARD_LAYOUT_LABELS: Record<number, string> = {
  0x01: 'US_ENGLISH (default)',
  0x02: 'CANADIAN_FRENCH',
  0x03: 'CANADIAN_MULTILINGUAL',
  0x04: 'DANISH',
  0x1b: 'DANISH_MAC',
  0x05: 'FINNISH',
  0x06: 'FRENCH',
  0x07: 'FRENCH_BELGIAN',
  0x08: 'FRENCH_SWISS',
  0x09: 'GERMAN',
  0x0a: 'GERMAN_MAC',
  0x0b: 'GERMAN_SWISS',
  0x0c: 'ICELANDIC',
  0x0d: 'IRISH',
  0x0e: 'ITALIAN',
  0x0f: 'NORWEGIAN',
  0x10: 'PORTUGUESE',
  0x11: 'PORTUGUESE_BRAZILIAN',
  0x12: 'SPANISH',
  0x13: 'SPANISH_LATIN_AMERICA',
  0x14: 'SWEDISH',
  0x15: 'TURKISH',
  0x16: 'UNITED_KINGDOM',
  0x17: 'US_INTERNATIONAL',
  0x18: 'CZECH',
  0x19: 'SERBIAN_LATIN_ONLY',
  0x1a: 'HUNGARIAN',
  0x1c: 'DVORAK',
};

/**
 * WIPEMODE field (12): 0/1 = data wipe on failed PINs; 2 = full wipe (firmware hash).
 * Full wipe only when config mode, first-use, or non-encrypted profile (okcore.cpp).
 */
export const WIPE_MODES = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'On' },
] as const;

export const WIPE_MODE_FULL = 2;

/**
 * TFATYPE field (8): firmware stores buffer[7] as a 1-byte MFA type (okcore.h).
 * Old app sent radio strings ("googleAuthOtp" / "YubikeyOtp"); only the first byte is stored.
 */
export const MFA_TYPE_GOOGLE_AUTH = 'g';
export const MFA_TYPE_YUBI_OTP = 'Y';

/**
 * NEXTKEY field encodings (okcore.cpp set_slot / OnlyKey.ino process_slot addchar bits).
 * NEXTKEY1 (16) & NEXTKEY2 (3): 0=none, 1=tab, 2=return
 * NEXTKEY4 (18) & NEXTKEY5 (19): 0=none, 1=tab
 * NEXTKEY3 (6): 0=none, 1=tab, 2=return, 3=tab+return
 */
export const NEXTKEY_AFTER_FIELD_OPTIONS = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Tab' },
  { value: '2', label: 'Return' },
] as const;

export const NEXTKEY_BEFORE_FIELD_OPTIONS = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Tab' },
] as const;

export const NEXTKEY_AFTER_OTP_OPTIONS = [
  { value: '0', label: 'None' },
  { value: '1', label: 'Tab' },
  { value: '2', label: 'Return' },
  { value: '3', label: 'Tab + Return' },
] as const;

/** USB product IDs for OnlyKey DUO (see useDeviceStore SUPPORTED_DEVICES). */
export const DUO_PRODUCT_IDS = new Set([0x614c, 0x614e, 0x4211]);

/** Only unambiguous USB PIDs — 0x60FC is shared by Classic Beta 7+ and DUO; defer to firmware. */
export function deviceTypeFromProductId(productId: number): DeviceType | undefined {
  if (DUO_PRODUCT_IDS.has(productId)) return DeviceType.DUO;
  if (productId === 0x0486) return DeviceType.CLASSIC;
  if (productId === 0xb001) return DeviceType.BOOTLOADER;
  return undefined;
}

/** DUO version suffix 'n' = Duo_config[0]==1, no device PIN (okcore.cpp / OnlyKeyComm.js). */
export function isDuoNoPinVersion(version: string): boolean {
  const last = version.trim().slice(-1).toLowerCase();
  return last === 'n';
}

export type DuoProfileId = 'green' | 'blue' | 'yellow' | 'purple';

export const DUO_PROFILES: { id: DuoProfileId; name: string; color: string }[] = [
  { id: 'green', name: 'Green', color: 'bg-green-500' },
  { id: 'blue', name: 'Blue', color: 'bg-blue-500' },
  { id: 'yellow', name: 'Yellow', color: 'bg-yellow-500' },
  { id: 'purple', name: 'Purple', color: 'bg-purple-500' },
];

/** Classic OnlyKey: 6 buttons × 2 slots (short/long press). Indices per ResponseParser. */
export const CLASSIC_SLOT_ROWS: {
  left: { id: string; index: number }[];
  right: { id: string; index: number }[];
}[] = [
  { left: [{ id: '1a', index: 1 }, { id: '1b', index: 7 }], right: [{ id: '2a', index: 2 }, { id: '2b', index: 8 }] },
  { left: [{ id: '3a', index: 3 }, { id: '3b', index: 9 }], right: [{ id: '4a', index: 4 }, { id: '4b', index: 10 }] },
  { left: [{ id: '5a', index: 5 }, { id: '5b', index: 11 }], right: [{ id: '6a', index: 6 }, { id: '6b', index: 12 }] },
];

/**
 * DUO: 3 buttons per profile in physical order 1 | 3 | 2 (v5 app duo-slots table).
 * Display ids are always 1a–3b within the active profile.
 */
export const DUO_PROFILE_COLUMNS: Record<DuoProfileId, { id: string; index: number }[][]> = {
  green: [
    [{ id: '1a', index: 1 }, { id: '1b', index: 4 }],
    [{ id: '3a', index: 3 }, { id: '3b', index: 6 }],
    [{ id: '2a', index: 2 }, { id: '2b', index: 5 }],
  ],
  blue: [
    [{ id: '1a', index: 7 }, { id: '1b', index: 10 }],
    [{ id: '3a', index: 9 }, { id: '3b', index: 12 }],
    [{ id: '2a', index: 8 }, { id: '2b', index: 11 }],
  ],
  yellow: [
    [{ id: '1a', index: 13 }, { id: '1b', index: 16 }],
    [{ id: '3a', index: 15 }, { id: '3b', index: 18 }],
    [{ id: '2a', index: 14 }, { id: '2b', index: 17 }],
  ],
  purple: [
    [{ id: '1a', index: 19 }, { id: '1b', index: 22 }],
    [{ id: '3a', index: 21 }, { id: '3b', index: 24 }],
    [{ id: '2a', index: 20 }, { id: '2b', index: 23 }],
  ],
};

/** Physical slot indices per DUO profile (flat list). */
export const DUO_PROFILE_SLOTS: Record<DuoProfileId, { id: string; index: number }[]> = {
  green: [
    { id: '1a', index: 1 }, { id: '2a', index: 2 }, { id: '3a', index: 3 },
    { id: '1b', index: 4 }, { id: '2b', index: 5 }, { id: '3b', index: 6 },
  ],
  blue: [
    { id: '4a', index: 7 }, { id: '5a', index: 8 }, { id: '6a', index: 9 },
    { id: '4b', index: 10 }, { id: '5b', index: 11 }, { id: '6b', index: 12 },
  ],
  yellow: [
    { id: '7a', index: 13 }, { id: '8a', index: 14 }, { id: '9a', index: 15 },
    { id: '7b', index: 16 }, { id: '8b', index: 17 }, { id: '9b', index: 18 },
  ],
  purple: [
    { id: '10a', index: 19 }, { id: '11a', index: 20 }, { id: '12a', index: 21 },
    { id: '10b', index: 22 }, { id: '11b', index: 23 }, { id: '12b', index: 24 },
  ],
};