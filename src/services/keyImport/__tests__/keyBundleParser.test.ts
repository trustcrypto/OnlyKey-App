import { beforeEach, describe, expect, it, vi } from 'vitest';

const parsePrivateKeyMock = vi.fn();
const toBufferMock = vi.fn();

vi.mock('../../../api/device/sshpkNode', () => ({
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

import { parseKeyBundle } from '../keyBundleParser';

describe('parseKeyBundle', () => {
  beforeEach(() => {
    parsePrivateKeyMock.mockReset();
    toBufferMock.mockReset();
    readPrivateKey.mockReset();
    decryptKey.mockReset();
  });

  it('rejects unsupported formats', async () => {
    await expect(parseKeyBundle('not-a-key', '', 1)).rejects.toThrow(/Unsupported key format/);
  });

  it('auto-assigns a single SSH RSA key to the chosen slot', async () => {
    toBufferMock.mockReturnValue(Buffer.from(new Array(20).fill(1)));
    parsePrivateKeyMock.mockReturnValue({ type: 'rsa', toBuffer: toBufferMock });

    const result = await parseKeyBundle('-----BEGIN OPENSSH PRIVATE KEY-----', '', 3);
    expect(result.requiresSelection).toBe(false);
    expect(result.assignments).toHaveLength(1);
    expect(result.assignments[0].slot).toBe(3);
    expect(result.candidates[0].name).toBe('Primary Key');
  });

  it('auto-loads a single ECC SSH key onto the first ECC slot', async () => {
    toBufferMock.mockReturnValue(Buffer.from([1]));
    parsePrivateKeyMock.mockReturnValue({ type: 'ecdsa', toBuffer: toBufferMock });

    const result = await parseKeyBundle('-----BEGIN OPENSSH PRIVATE KEY-----', '', 99);
    expect(result.assignments[0].slot).toBe(101);
    expect(result.assignments[0].candidate.type).toBe(2);
  });

  it('requires selection when a chosen slot has multiple OpenPGP subkeys', async () => {
    readPrivateKey.mockResolvedValue({});
    decryptKey.mockResolvedValue({
      keyPacket: { algorithm: 'rsaEncryptSign', write: () => new Uint8Array(20) },
      subkeys: [{ keyPacket: { algorithm: 'rsaEncryptSign', write: () => new Uint8Array(20) } }],
    });

    const result = await parseKeyBundle('-----BEGIN PGP PRIVATE KEY BLOCK-----', 'pw', 2);
    expect(result.requiresSelection).toBe(true);
    expect(result.assignments).toEqual([]);
    expect(result.candidates).toHaveLength(2);
  });

  it('auto-assigns signing and decryption slots for OpenPGP bundles', async () => {
    readPrivateKey.mockResolvedValue({});
    decryptKey.mockResolvedValue({
      keyPacket: { algorithm: 'rsaEncryptSign', write: () => new Uint8Array(20) },
      subkeys: [
        { keyPacket: { algorithm: 'rsaEncryptSign', write: () => new Uint8Array(20) } },
        { keyPacket: { algorithm: 'rsaEncryptSign', write: () => new Uint8Array(20) } },
      ],
    });

    const result = await parseKeyBundle('-----BEGIN PGP PRIVATE KEY BLOCK-----', 'pw', 99);
    expect(result.requiresSelection).toBe(false);
    expect(result.assignments.map((a) => a.slot)).toEqual([2, 1]);
    expect(result.assignments[0].candidate.id).toBe('2');
    expect(result.assignments[1].candidate.id).toBe('1');
  });

  it('requires a passcode for OpenPGP keys', async () => {
    await expect(parseKeyBundle('-----BEGIN PGP PRIVATE KEY BLOCK-----', '', 99)).rejects.toThrow(
      /Passcode is required/
    );
  });

  it('throws when OpenPGP key has no private material', async () => {
    readPrivateKey.mockResolvedValue({});
    decryptKey.mockResolvedValue({ keyPacket: null, subkeys: [] });
    await expect(parseKeyBundle('-----BEGIN PGP PRIVATE KEY BLOCK-----', 'pw', 99)).rejects.toThrow(
      /No private key material/
    );
  });
});
