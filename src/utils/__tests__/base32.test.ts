import { describe, expect, it } from 'vitest';
import { base32ToHex } from '../base32';

describe('base32ToHex', () => {
  it('decodes the RFC 4648 "Hello!" secret', () => {
    expect(base32ToHex('JBSWY3DPEHPK3PXP')).toBe('48656c6c6f21deadbeef');
  });

  it('ignores whitespace and padding', () => {
    expect(base32ToHex('JBSW Y3DP EHPK 3PXP====')).toBe(base32ToHex('JBSWY3DPEHPK3PXP'));
  });
});
