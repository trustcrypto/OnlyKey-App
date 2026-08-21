import { beforeEach, describe, expect, it, vi } from 'vitest';

const parsePrivateKeyMock = vi.fn();

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

function rsaPacket(fill: number, bytes = 128) {
  return {
    algorithm: 'rsaEncryptSign',
    privateParams: {
      p: new Uint8Array(bytes).fill(fill),
      q: new Uint8Array(bytes).fill(fill + 1),
    },
    write: () => new Uint8Array(400).fill(9),
  };
}

describe('parseKeyBundle', () => {
  beforeEach(() => {
    parsePrivateKeyMock.mockReset();
    readPrivateKey.mockReset();
    decryptKey.mockReset();
  });

  it('rejects unsupported formats', async () => {
    await expect(parseKeyBundle('not-a-key', '', 1)).rejects.toThrow(/Unsupported key format/);
  });

  it('auto-assigns a 2048-bit SSH RSA key as type 2 p||q', async () => {
    const p = new Uint8Array(128).fill(1);
    const q = new Uint8Array(128).fill(2);
    parsePrivateKeyMock.mockReturnValue({
      type: 'rsa',
      part: { p: { data: p }, q: { data: q } },
    });

    const result = await parseKeyBundle('-----BEGIN OPENSSH PRIVATE KEY-----', '', 3);
    expect(result.requiresSelection).toBe(false);
    expect(result.assignments[0].slot).toBe(3);
    expect(result.assignments[0].candidate.type).toBe(2);
    expect(result.assignments[0].candidate.kind).toBe('rsa');
    expect(result.assignments[0].candidate.keyData).toHaveLength(256);
  });

  it('auto-loads a single ECC SSH key onto the first ECC slot', async () => {
    parsePrivateKeyMock.mockReturnValue({
      type: 'ecdsa',
      curve: 'nistp256',
      part: { d: { data: new Uint8Array(32).fill(1) } },
    });

    const result = await parseKeyBundle('-----BEGIN OPENSSH PRIVATE KEY-----', '', 99);
    expect(result.assignments[0].slot).toBe(101);
    expect(result.assignments[0].candidate.type).toBe(2);
    expect(result.assignments[0].candidate.kind).toBe('ecc');
  });

  it('requires selection when a chosen slot has multiple OpenPGP subkeys', async () => {
    readPrivateKey.mockResolvedValue({});
    decryptKey.mockResolvedValue({
      keyPacket: rsaPacket(1),
      subkeys: [{ keyPacket: rsaPacket(3) }],
    });

    const result = await parseKeyBundle('-----BEGIN PGP PRIVATE KEY BLOCK-----', 'pw', 2);
    expect(result.requiresSelection).toBe(true);
    expect(result.assignments).toEqual([]);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0].type).toBe(2);
  });

  it('auto-assigns signing and decryption slots for OpenPGP bundles', async () => {
    readPrivateKey.mockResolvedValue({});
    decryptKey.mockResolvedValue({
      keyPacket: rsaPacket(1),
      subkeys: [{ keyPacket: rsaPacket(3) }, { keyPacket: rsaPacket(5) }],
    });

    const result = await parseKeyBundle('-----BEGIN PGP PRIVATE KEY BLOCK-----', 'pw', 99);
    expect(result.requiresSelection).toBe(false);
    expect(result.assignments.map((a) => a.slot)).toEqual([2, 1]);
    expect(result.assignments[0].candidate.id).toBe('2');
    expect(result.assignments[1].candidate.id).toBe('1');
  });

  it('auto-assigns ECC OpenPGP bundles onto slots 102 and 101, not RSA 1/2', async () => {
    const eccPacket = (fill: number) => ({
      getAlgorithmInfo: () => ({ algorithm: 'ed25519' }),
      privateParams: { seed: new Uint8Array(32).fill(fill) },
    });
    readPrivateKey.mockResolvedValue({});
    decryptKey.mockResolvedValue({
      keyPacket: eccPacket(1),
      subkeys: [{ keyPacket: eccPacket(2) }],
    });

    const result = await parseKeyBundle('-----BEGIN PGP PRIVATE KEY BLOCK-----', 'pw', 99);
    expect(result.assignments.map((a) => a.slot)).toEqual([102, 101]);
    expect(result.assignments[0].candidate.kind).toBe('ecc');
    expect(result.assignments[1].candidate.kind).toBe('ecc');
    expect(result.assignments[0].candidate.id).toBe('0');
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
