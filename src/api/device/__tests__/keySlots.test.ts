import { describe, expect, it } from 'vitest';
import { ECC_SLOTS, KEY_SLOTS, RSA_SLOTS, isOpenPgpKey, isSshKey } from '../keySlots';

describe('keySlots', () => {
  it('exports firmware RSA and ECC slot ranges', () => {
    expect(RSA_SLOTS).toEqual([1, 2, 3, 4]);
    expect(ECC_SLOTS[0]).toBe(101);
    expect(ECC_SLOTS).toHaveLength(10);
    expect(KEY_SLOTS.backup).toBe(131);
    expect(KEY_SLOTS.backupType).toBe(161);
  });

  it('detects OpenPGP vs SSH PEM', () => {
    expect(isOpenPgpKey('-----BEGIN PGP PRIVATE KEY BLOCK-----')).toBe(true);
    expect(isSshKey('-----BEGIN PGP PRIVATE KEY BLOCK-----')).toBe(false);
    expect(isSshKey('-----BEGIN OPENSSH PRIVATE KEY-----')).toBe(true);
    expect(isSshKey('not a key')).toBe(false);
  });
});
