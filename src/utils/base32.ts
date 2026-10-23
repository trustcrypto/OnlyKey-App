import { strPad } from '../api/device/utils';

export function base32ToHex(base32: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  let hex = '';
  const cleaned = base32.replace(/\s+/g, '').replace(/=+$/, '');

  for (let i = 0; i < cleaned.length; i++) {
    const val = alphabet.indexOf(cleaned.charAt(i).toUpperCase());
    if (val < 0) {
      throw new Error('Invalid Base32 character in TOTP secret.');
    }
    bits += strPad(val.toString(2), 5, '0');
  }

  for (let i = 0; i + 4 <= bits.length; i += 4) {
    hex += parseInt(bits.substr(i, 4), 2).toString(16);
  }

  return hex;
}