import { describe, expect, it } from 'vitest';
import { base32ToHex } from '../base32';

describe('base32ToHex', () => {
  it('decodes the RFC 4648 "Hello!" secret', () => {
    expect(base32ToHex('JBSWY3DPEHPK3PXP')).toBe('48656c6c6f21deadbeef');
  });

  it('ignores whitespace and trailing padding', () => {
    expect(base32ToHex('JBSW Y3DP EHPK 3PXP====')).toBe(base32ToHex('JBSWY3DPEHPK3PXP'));
    expect(base32ToHex('jbswy3dpehpk3pxp')).toBe(base32ToHex('JBSWY3DPEHPK3PXP'));
  });

  it('rejects invalid Base32 characters instead of skipping them', () => {
    expect(() => base32ToHex('JBSWY3DPEHPK3PXP1')).toThrow(/Invalid Base32 character/);
    expect(() => base32ToHex('JBSWY3DPEHPK3PXP8')).toThrow(/Invalid Base32 character/);
    expect(() => base32ToHex('JBSWY3DPEHPK3PXP0')).toThrow(/Invalid Base32 character/);
    expect(() => base32ToHex('JBSW=Y3DP')).toThrow(/Invalid Base32 character/);
  });

  it('returns an empty string for empty or padding-only input', () => {
    expect(base32ToHex('')).toBe('');
    expect(base32ToHex('====')).toBe('');
  });
});
