import { describe, it, expect } from 'vitest';
import { hidLabelSlotByte, parseHidLabelSlotId, ResponseParser } from '../ResponseParser';
import { DeviceType } from '../types';

describe('ResponseParser', () => {
  const stringToPacket = (text: string) => {
    const data = new Uint8Array(64);
    for (let i = 0; i < text.length; i++) {
      data[i] = text.charCodeAt(i);
    }
    return data;
  };

  it('treats a wiped device as uninitialized, not locked', () => {
    const data = stringToPacket('UNINITIALIZEDv2.1.0-prod');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('status');
    expect(res.deviceType).toBe(DeviceType.UNINITIALIZED);
    expect(res.isLocked).toBe(false);
    expect(res.devicePinSet).toBe(false);
    expect(res.version).toBe('v2.1.0-prod');
  });

  it('should parse OnlyKey Classic initialization', () => {
    const data = stringToPacket('INITIALIZEDv2.1.0-prod');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('status');
    expect(res.deviceType).toBe(DeviceType.CLASSIC);
    expect(res.isLocked).toBe(true);
    expect(res.version).toBe('v2.1.0-prod');
  });

  it('should parse OnlyKey Duo initialization', () => {
    const data = stringToPacket('INITIALIZED-Dv3.0.0-prod');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('status');
    expect(res.deviceType).toBe(DeviceType.DUO);
    expect(res.isLocked).toBe(true);
  });

  it('should keep Classic on unlocked v2 firmware even with a p suffix', () => {
    const data = stringToPacket('UNLOCKEDv2.1.0-prodp');
    const res = ResponseParser.parse(data);
    expect(res.deviceType).toBe(DeviceType.CLASSIC);
  });

  it('should infer DUO from unlocked v3 firmware without -D suffix', () => {
    const data = stringToPacket('UNLOCKEDv3.0.0-prod');
    const res = ResponseParser.parse(data);
    expect(res.isLocked).toBe(false);
    expect(res.version).toBe('v3.0.0-prod');
    expect(res.deviceType).toBe(DeviceType.DUO);
  });

  it('should parse DUO unlocked state with -D prefix', () => {
    const data = stringToPacket('UNLOCKED-Dv3.0.0-prod');
    const res = ResponseParser.parse(data);
    expect(res.deviceType).toBe(DeviceType.DUO);
    expect(res.isLocked).toBe(false);
  });

  it('should parse Slot Labels correctly', () => {
    const data = stringToPacket('01|GitHub Login');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('label');
    expect(res.slotId).toBe(1);
    expect(res.label).toBe('GitHub Login');
  });

  it('maps HID hex 1a–1e to slots 20–24, not Classic buttons', () => {
    const data = stringToPacket('1a|Work VPN');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('label');
    expect(res.slotId).toBe(20);
    expect(res.label).toBe('Work VPN');
    expect(parseHidLabelSlotId('1e')).toBe(24);
    expect(parseHidLabelSlotId('10')).toBe(10);
  });

  it('decodes firmware-coded binary label reports for slots 10, 12, 20, and 24', () => {
    const firmwarePacket = (logicalSlot: number, label: string) => {
      const data = new Uint8Array(64);
      data[0] = hidLabelSlotByte(logicalSlot);
      data[1] = 0x7c;
      for (let i = 0; i < label.length; i++) data[i + 2] = label.charCodeAt(i);
      return data;
    };

    expect(hidLabelSlotByte(9)).toBe(9);
    expect(hidLabelSlotByte(10)).toBe(0x10);
    expect(hidLabelSlotByte(12)).toBe(0x12);
    expect(hidLabelSlotByte(20)).toBe(0x1a);
    expect(hidLabelSlotByte(24)).toBe(0x1e);

    expect(ResponseParser.parse(firmwarePacket(1, 'Gmail'))).toMatchObject({
      type: 'label',
      slotId: 1,
      label: 'Gmail',
    });
    expect(ResponseParser.parse(firmwarePacket(10, 'Slack'))).toMatchObject({
      type: 'label',
      slotId: 10,
      label: 'Slack',
    });
    expect(ResponseParser.parse(firmwarePacket(12, 'Bank'))).toMatchObject({
      type: 'label',
      slotId: 12,
      label: 'Bank',
    });
    expect(ResponseParser.parse(firmwarePacket(20, 'Yellow'))).toMatchObject({
      type: 'label',
      slotId: 20,
      label: 'Yellow',
    });
    expect(ResponseParser.parse(firmwarePacket(24, 'Purple'))).toMatchObject({
      type: 'label',
      slotId: 24,
      label: 'Purple',
    });
  });

  it('does not treat a raw slot-10 byte 0x0A as a firmware label', () => {
    const data = new Uint8Array(64);
    data[0] = 10;
    data[1] = 0x7c;
    data[2] = 'X'.charCodeAt(0);
    const res = ResponseParser.parse(data);
    expect(res.type).not.toBe('label');
  });

  it('treats BOOTLOADER as an unlocked status, not free text', () => {
    const data = stringToPacket('BOOTLOADER');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('status');
    expect(res.deviceType).toBe(DeviceType.BOOTLOADER);
    expect(res.isLocked).toBe(false);
    expect(res.text).toBe('BOOTLOADER');
  });

  it('should parse error messages', () => {
    const data = stringToPacket('Error: Not in Config Mode');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('error');
    expect(res.error).toContain('Error');
  });

  it('should handle empty or garbage data gracefully', () => {
    const data = new Uint8Array(64).fill(0);
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('text');
    expect(res.text).toBe('');
  });
});
