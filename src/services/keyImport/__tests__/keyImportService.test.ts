import { beforeEach, describe, expect, it, vi } from 'vitest';

const parseKeyBundle = vi.fn();

vi.mock('../keyBundleParser', () => ({
  parseKeyBundle: (...args: unknown[]) => parseKeyBundle(...args),
}));

import { importPemKey, isSelectionRequiredError } from '../keyImportService';

const candidate = { id: '0', name: 'Primary Key', type: 1, keyData: [1, 2] };

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

  it('loads auto-assigned keys and optionally sets backup mode', async () => {
    parseKeyBundle.mockResolvedValue({
      requiresSelection: false,
      assignments: [{ candidate, slot: 2 }],
      candidates: [candidate],
    });

    const result = await importPemKey(device as never, {
      pem: '-----BEGIN OPENSSH PRIVATE KEY-----',
      passcode: '',
      slotChoice: 99,
      setAsBackup: true,
    });

    expect(device.setPrivateKey).toHaveBeenCalledWith(2, 1, [1, 2]);
    expect(device.setBackupKeyMode).toHaveBeenCalledWith(1);
    expect(result).toEqual({ loadedCount: 1, usedSelection: false });
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
    const second = { id: '1', name: 'Subkey 1', type: 2, keyData: [9] };
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
