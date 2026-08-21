import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseKeyBundle = vi.fn();

vi.mock('../keyBundleParser', () => ({
  parseKeyBundle: (...args: unknown[]) => parseKeyBundle(...args),
}));

import { importPemKey, isSelectionRequiredError } from '../keyImportService';

const candidate = { id: '0', name: 'Primary Key', type: 2, keyData: [1, 2], kind: 'rsa' as const };

describe('importPemKey', () => {
  const device = {
    setPrivateKey: vi.fn().mockResolvedValue(undefined),
    setBackupKeyMode: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    parseKeyBundle.mockReset();
    device.setPrivateKey.mockClear();
    device.setBackupKeyMode.mockClear();
  });

  it('loads keys and ORs the backup modifier instead of locking BACKUPKEYMODE', async () => {
    parseKeyBundle.mockResolvedValue({
      requiresSelection: false,
      assignments: [{ candidate, slot: 1 }],
      candidates: [candidate],
    });

    const result = await importPemKey(device as never, {
      pem: '-----BEGIN OPENSSH PRIVATE KEY-----',
      passcode: '',
      slotChoice: 99,
      setAsBackup: true,
    });

    // Slot 1 RSA: type 2 | decryption 32 | backup 128 = 162
    expect(device.setPrivateKey).toHaveBeenCalledWith(1, 162, [1, 2]);
    expect(device.setBackupKeyMode).not.toHaveBeenCalled();
    expect(result).toEqual({ loadedCount: 1, usedSelection: false });
  });

  it('ORs ECC auto-load signature and decryption flags onto slots 102 and 101', async () => {
    const sign = { id: '0', name: 'Primary Key', type: 1, keyData: [1], kind: 'ecc' as const };
    const decrypt = { id: '1', name: 'Subkey 1', type: 1, keyData: [2], kind: 'ecc' as const };
    parseKeyBundle.mockResolvedValue({
      requiresSelection: false,
      assignments: [
        { candidate: sign, slot: 102 },
        { candidate: decrypt, slot: 101 },
      ],
      candidates: [sign, decrypt],
    });

    await importPemKey(device as never, {
      pem: '-----BEGIN PGP PRIVATE KEY BLOCK-----',
      passcode: 'pw',
      slotChoice: 99,
    });

    expect(device.setPrivateKey).toHaveBeenCalledWith(102, 1 | 64, [1]);
    expect(device.setPrivateKey).toHaveBeenCalledWith(101, 1 | 32, [2]);
  });

  it('ORs the signature modifier when requested', async () => {
    const ecc = { id: '0', name: 'Primary Key', type: 1, keyData: [9], kind: 'ecc' as const };
    parseKeyBundle.mockResolvedValue({
      requiresSelection: false,
      assignments: [{ candidate: ecc, slot: 101 }],
      candidates: [ecc],
    });

    await importPemKey(device as never, {
      pem: '-----BEGIN OPENSSH PRIVATE KEY-----',
      passcode: '',
      slotChoice: 101,
      setAsSignature: true,
    });

    expect(device.setPrivateKey).toHaveBeenCalledWith(101, 1 | 64, [9]);
  });

  it('throws KEY_SELECTION_REQUIRED when the user must pick a subkey', async () => {
    parseKeyBundle.mockResolvedValue({
      requiresSelection: true,
      assignments: [],
      candidates: [candidate, { ...candidate, id: '1' }],
    });

    await expect(
      importPemKey(device as never, {
        pem: '-----BEGIN PGP PRIVATE KEY BLOCK-----',
        passcode: 'pw',
        slotChoice: 2,
      })
    ).rejects.toThrow('KEY_SELECTION_REQUIRED');
    expect(isSelectionRequiredError(new Error('KEY_SELECTION_REQUIRED'))).toBe(true);
    expect(isSelectionRequiredError(new Error('other'))).toBe(false);
  });

  it('loads the selected candidate into the target slot', async () => {
    const second = { id: '1', name: 'Subkey 1', type: 2, keyData: [9], kind: 'ecc' as const };
    parseKeyBundle.mockResolvedValue({
      requiresSelection: true,
      assignments: [],
      candidates: [candidate, second],
    });

    const result = await importPemKey(device as never, {
      pem: '-----BEGIN PGP PRIVATE KEY BLOCK-----',
      passcode: 'pw',
      slotChoice: 2,
      selectedCandidateId: '1',
      targetSlot: 101,
    });

    expect(device.setPrivateKey).toHaveBeenCalledWith(101, 2, [9]);
    expect(result.usedSelection).toBe(true);
  });

  it('rejects an unknown selected candidate', async () => {
    parseKeyBundle.mockResolvedValue({
      requiresSelection: true,
      assignments: [],
      candidates: [candidate],
    });

    await expect(
      importPemKey(device as never, {
        pem: '-----BEGIN PGP PRIVATE KEY BLOCK-----',
        passcode: 'pw',
        slotChoice: 2,
        selectedCandidateId: 'missing',
        targetSlot: 1,
      })
    ).rejects.toThrow(/Selected key not found/);
  });
});
