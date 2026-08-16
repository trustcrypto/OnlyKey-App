import { describe, it, expect } from 'vitest';
import {
  KEYBOARD_LAYOUTS,
  isDuoNoPinVersion,
  NEXTKEY_AFTER_OTP_OPTIONS,
  MFA_TYPE_GOOGLE_AUTH,
  MFA_TYPE_YUBI_OTP,
} from '../firmwareConstants';

describe('firmwareConstants', () => {
  it('maps keyboard layouts to keylayouts.h values', () => {
    expect(KEYBOARD_LAYOUTS.find((l) => l.label === 'French')?.value).toBe(0x06);
    expect(KEYBOARD_LAYOUTS.find((l) => l.label === 'German')?.value).toBe(0x09);
    expect(KEYBOARD_LAYOUTS.find((l) => l.label === 'United Kingdom')?.value).toBe(0x16);
    expect(KEYBOARD_LAYOUTS.find((l) => l.label === 'Spanish')?.value).toBe(0x12);
  });

  it('detects DUO no-PIN from version suffix per okcore/OnlyKeyComm', () => {
    expect(isDuoNoPinVersion('3.0.0-prod-n')).toBe(true);
    expect(isDuoNoPinVersion('3.0.0-prod-p')).toBe(false);
  });

  it('encodes NEXTKEY3 after-OTP options per okcore.cpp case 6', () => {
    expect(NEXTKEY_AFTER_OTP_OPTIONS.map((o) => o.value)).toEqual(['0', '1', '2', '3']);
  });

  it('encodes TFATYPE as firmware MFA first-byte codes', () => {
    expect(MFA_TYPE_GOOGLE_AUTH).toBe('g');
    expect(MFA_TYPE_GOOGLE_AUTH.charCodeAt(0)).toBe(103);
    expect(MFA_TYPE_YUBI_OTP).toBe('Y');
    expect(MFA_TYPE_YUBI_OTP.charCodeAt(0)).toBe(89);
  });
});