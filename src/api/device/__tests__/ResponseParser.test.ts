import { describe, it, expect } from 'vitest';
import { ResponseParser } from '../ResponseParser';
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

  it('should parse logical Slot IDs (1a-6b)', () => {
    const data = stringToPacket('1a|Work VPN');
    const res = ResponseParser.parse(data);
    expect(res.type).toBe('label');
    expect(res.slotId).toBe(1);
    expect(res.label).toBe('Work VPN');
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
