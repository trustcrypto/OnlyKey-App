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

export class ResponseParser {
  /**
   * Parses raw bytes from OnlyKey into a structured Response object.
   */
  public static parse(data: Uint8Array): DeviceResponse {
    let text = '';

    for (let i = 0; i < data.length; i++) {
      if (data[i] > 31 && data[i] < 127) {
        text += String.fromCharCode(data[i]);
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
        isLocked: true,
        devicePinSet: !isDuoNoPinFromStatusText(text),
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

    if (text.includes('LOCKED')) {
      return { type: 'status', text, isLocked: true };
    }

    let parsedSlotId: number | undefined;
    let parsedLabel: string | undefined;

    const labelMatch = text.match(/^(\w+)\|(.*)/);
    if (labelMatch) {
      parsedSlotId = this.parseSlotId(labelMatch[1]);
      parsedLabel = labelMatch[2].trim();
    } else if (data[0] > 0 && data[0] <= 24 && (data[1] === 124 || text.startsWith('|'))) {
      parsedSlotId = data[0];
      parsedLabel = text.startsWith('|') ? text.substring(1).trim() : text.trim();
    }

    if (parsedSlotId !== undefined && parsedLabel !== undefined) {
      return {
        type: 'label',
        slotId: parsedSlotId,
        label: parsedLabel,
        text,
      };
    }

    return { type: 'text', text };
  }

  private static parseSlotId(id: string): number {
    const map: Record<string, number> = {
      '1a': 1, '2a': 2, '3a': 3, '4a': 4, '5a': 5, '6a': 6,
      '1b': 7, '2b': 8, '3b': 9, '4b': 10, '5b': 11, '6b': 12,
      '7a': 13, '8a': 14, '9a': 15, '10a': 16, '11a': 17, '12a': 18,
      '7b': 19, '8b': 20, '9b': 21, '10b': 22, '11b': 23, '12b': 24,
    };
    return map[id.toLowerCase()] || parseInt(id, 10);
  }
}