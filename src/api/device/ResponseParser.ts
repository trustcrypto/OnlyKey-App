import { DeviceType } from './types';
import {
  inferDeviceTypeFromStatusText,
  inferDeviceTypeFromVersion,
  isDuoNoPinFromStatusText,
} from './deviceTypeFromStatus';

export interface DeviceResponse {
  type: 'text' | 'error' | 'status' | 'label';
  text?: string;
  error?: string;
  slotId?: number;
  label?: string;
  deviceType?: DeviceType;
  version?: string;
  isLocked?: boolean;
  devicePinSet?: boolean;
}

function extractVersionAfterPrefix(text: string, prefix: string, withV = true): string {
  if (withV && text.includes(`${prefix}v`)) {
    return text.split(prefix).pop()?.trim() ?? '';
  }
  return text.replace(prefix, '').trim();
}

function byteToHex(value: number): string {
  return (value < 16 ? '0' : '') + value.toString(16);
}

/** Firmware `get_slot_labels`: slots 1–9 as `i`, 10–24 as `i+6` (0x10–0x1E). */
export function hidLabelSlotByte(slotId: number): number {
  return slotId <= 9 ? slotId : slotId + 6;
}

/** 5.6 `handleGetLabels`: HID hex `1a`–`1e` are slots 20–24, not Classic buttons 1a/1b. */
export function parseHidLabelSlotId(id: string): number {
  switch (id.toLowerCase()) {
    case '1a':
      return 20;
    case '1b':
      return 21;
    case '1c':
      return 22;
    case '1d':
      return 23;
    case '1e':
      return 24;
    default: {
      const n = parseInt(id, 10);
      return Number.isFinite(n) ? n : 0;
    }
  }
}

export class ResponseParser {
  /**
   * Parses raw bytes from OnlyKey into a structured Response object.
   */
  public static parse(data: Uint8Array): DeviceResponse {
    let text = '';

    for (let i = 0; i < data.length; i++) {
      if (data[i] > 31 && data[i] < 127) {
        text += String.fromCharCode(data[i]);
      } else if (i === 0 && data[0] > 0 && data[1] === 0x7C) {
        // 5.6 readBytes: first byte of a label report is hex, not a raw 1–24 index.
        text += byteToHex(data[0]);
      }
    }

    text = text.trim();

    if (text.startsWith('Error') || text.startsWith('ERROR')) {
      return { type: 'error', error: text };
    }

    if (text.includes('UNINITIALIZED')) {
      const version = extractVersionAfterPrefix(text, 'UNINITIALIZED');
      return {
        type: 'status',
        text,
        version,
        deviceType: DeviceType.UNINITIALIZED,
        isLocked: false,
        devicePinSet: false,
      };
    }

    if (text.includes('UNLOCKED-D')) {
      const version = extractVersionAfterPrefix(text, 'UNLOCKED-D');
      return {
        type: 'status',
        text,
        version,
        deviceType: DeviceType.DUO,
        isLocked: false,
        devicePinSet: !isDuoNoPinFromStatusText(text),
      };
    }

    if (text.includes('UNLOCKED')) {
      const version = extractVersionAfterPrefix(text, 'UNLOCKED');
      const deviceType =
        inferDeviceTypeFromStatusText(text) ?? inferDeviceTypeFromVersion(version);
      return {
        type: 'status',
        text,
        version,
        deviceType,
        isLocked: false,
        devicePinSet: deviceType === DeviceType.DUO ? !isDuoNoPinFromStatusText(text) : true,
      };
    }

    if (text.includes('INITIALIZED-D')) {
      const version = extractVersionAfterPrefix(text, 'INITIALIZED-D');
      return {
        type: 'status',
        text,
        version,
        deviceType: DeviceType.DUO,
        isLocked: true,
        devicePinSet: !isDuoNoPinFromStatusText(text),
      };
    }

    if (text.includes('INITIALIZED') && !text.includes('UNINITIALIZED')) {
      const version = extractVersionAfterPrefix(text, 'INITIALIZED');
      return {
        type: 'status',
        text,
        version,
        deviceType: DeviceType.CLASSIC,
        isLocked: true,
      };
    }

    if (text.includes('BOOTLOADER')) {
      return {
        type: 'status',
        text,
        deviceType: DeviceType.BOOTLOADER,
        isLocked: false,
      };
    }

    if (text.includes('LOCKED')) {
      return { type: 'status', text, isLocked: true };
    }

    const labelMatch = text.match(/^(\w+)\|(.*)/);
    if (labelMatch) {
      const slotId = parseHidLabelSlotId(labelMatch[1]);
      if (slotId >= 1 && slotId <= 24) {
        return {
          type: 'label',
          slotId,
          label: labelMatch[2].trim(),
          text,
        };
      }
    }

    return { type: 'text', text };
  }
}