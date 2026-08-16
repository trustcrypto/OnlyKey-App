import { beforeEach, describe, expect, it, vi } from 'vitest';

const parsePrivateKeyMock = vi.fn();
const toBufferMock = vi.fn();

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

describe('keyParser', () => {
  beforeEach(() => {
    parsePrivateKeyMock.mockReset();
    toBufferMock.mockReset();
    readPrivateKey.mockReset();
    decryptKey.mockReset();
  });

  it('hashes backup passphrases with SHA-256', () => {
    const bytes = hashBackupPassphrase('secret');
    expect(bytes).toHaveLength(32);
    expect(bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)).toBe(true);
  });

  it('parses SSH RSA keys onto RSA slots', async () => {
    toBufferMock.mockReturnValue(Buffer.from([1, 2, 3]));
    parsePrivateKeyMock.mockReturnValue({ type: 'rsa', toBuffer: toBufferMock });

    const parsed = await parsePrivateKey('-----BEGIN OPENSSH PRIVATE KEY-----', 'pw', 99);
    expect(parsed).toEqual({ slot: 1, type: 1, keyData: [1, 2, 3] });
    expect(parsePrivateKeyMock).toHaveBeenCalledWith(
      '-----BEGIN OPENSSH PRIVATE KEY-----',
      'pem',
      { passphrase: 'pw' }
    );
  });

  it('parses SSH ed25519 keys onto ECC slots', async () => {
    toBufferMock.mockReturnValue(Buffer.from([9]));
    parsePrivateKeyMock.mockReturnValue({ type: 'ed25519', toBuffer: toBufferMock });

    const parsed = await parsePrivateKey('-----BEGIN OPENSSH PRIVATE KEY-----', '', 99);
    expect(parsed.slot).toBe(101);
    expect(parsed.type).toBe(2);
  });

  it('requires a passcode for OpenPGP keys', async () => {
    await expect(parsePrivateKey('-----BEGIN PGP PRIVATE KEY BLOCK-----', '', 1)).rejects.toThrow(
      /Passcode is required/
    );
  });

  it('parses OpenPGP RSA keys', async () => {
    readPrivateKey.mockResolvedValue({});
    decryptKey.mockResolvedValue({
      keyPacket: {
        algorithm: 1,
        write: () => new Uint8Array([4, 5]),
      },
    });

    const parsed = await parsePrivateKey('-----BEGIN PGP PRIVATE KEY BLOCK-----', 'pw', 99);
    expect(parsed).toEqual({ slot: 1, type: 1, keyData: [4, 5] });
  });

  it('throws when OpenPGP key has no packet', async () => {
    readPrivateKey.mockResolvedValue({});
    decryptKey.mockResolvedValue({ keyPacket: null });
    await expect(parsePrivateKey('-----BEGIN PGP PRIVATE KEY BLOCK-----', 'pw', 2)).rejects.toThrow(
      /Could not read key parameters/
    );
  });
});
