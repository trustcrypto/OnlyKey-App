import { beforeEach, describe, expect, it, vi } from 'vitest';

const parsePrivateKeyMock = vi.fn();

vi.mock('../sshpkNode', () => ({
  loadSshpk: () => ({
    parsePrivateKey: parsePrivateKeyMock,
  }),
}));

const readPrivateKey = vi.fn();
const decryptKey = vi.fn();

vi.mock('openpgp', () => ({
  readPrivateKey: (...args: unknown[]) => readPrivateKey(...args),
  decryptKey: (...args: unknown[]) => decryptKey(...args),
}));

import { hashBackupPassphrase, parsePrivateKey } from '../keyParser';

function rsaParts(bytes = 128) {
  return {
    p: { data: new Uint8Array(bytes).fill(1) },
    q: { data: new Uint8Array(bytes).fill(2) },
  };
}

describe('keyParser', () => {
  beforeEach(() => {
    parsePrivateKeyMock.mockReset();
    readPrivateKey.mockReset();
    decryptKey.mockReset();
  });

  it('hashes backup passphrases with SHA-256', () => {
    const bytes = hashBackupPassphrase('secret');
    expect(bytes).toHaveLength(32);
    expect(bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true);
  });

  it('parses SSH RSA keys as p||q onto RSA slots', async () => {
    parsePrivateKeyMock.mockReturnValue({ type: 'rsa', part: rsaParts(128) });

    const parsed = await parsePrivateKey('-----BEGIN OPENSSH PRIVATE KEY-----', 'pw', 99);
    expect(parsed.slot).toBe(1);
    expect(parsed.type).toBe(2);
    expect(parsed.keyData).toHaveLength(256);
    expect(parsePrivateKeyMock).toHaveBeenCalledWith(
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'pem',
      { passphrase: 'pw' }
    );
  });

  it('parses SSH ed25519 keys onto ECC slots', async () => {
    parsePrivateKeyMock.mockReturnValue({
      type: 'ed25519',
      part: { k: { data: new Uint8Array(32).fill(9) } },
    });

    const parsed = await parsePrivateKey('-----BEGIN OPENSSH PRIVATE KEY-----', '', 99);
    expect(parsed.slot).toBe(101);
    expect(parsed.type).toBe(1);
    expect(parsed.keyData).toHaveLength(32);
  });

  it('requires a passcode for OpenPGP keys', async () => {
    await expect(parsePrivateKey('-----BEGIN PGP PRIVATE KEY BLOCK-----', '', 1)).rejects.toThrow(
      /Passcode is required/
    );
  });

  it('parses OpenPGP RSA keys as p||q, not the packet blob', async () => {
    const p = new Uint8Array(128).fill(4);
    const q = new Uint8Array(128).fill(5);
    readPrivateKey.mockResolvedValue({});
    decryptKey.mockResolvedValue({
      keyPacket: {
        algorithm: 1,
        privateParams: { p, q },
        write: () => new Uint8Array(400).fill(9),
      },
    });

    const parsed = await parsePrivateKey('-----BEGIN PGP PRIVATE KEY BLOCK-----', 'pw', 99);
    expect(parsed.slot).toBe(1);
    expect(parsed.type).toBe(2);
    expect(parsed.keyData).toEqual([...p, ...q]);
  });

  it('throws when OpenPGP key has no packet', async () => {
    readPrivateKey.mockResolvedValue({});
    decryptKey.mockResolvedValue({ keyPacket: null });
    await expect(parsePrivateKey('-----BEGIN PGP PRIVATE KEY BLOCK-----', 'pw', 2)).rejects.toThrow(
      /Could not read key parameters/
    );
  });
});
