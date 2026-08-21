import { describe, expect, it } from 'vitest';
import {
  applyPrivateKeyTypeModifiers,
  eccScalar32,
  KEY_TYPE_BACKUP,
  KEY_TYPE_DECRYPTION,
  KEY_TYPE_SIGNATURE,
  materialFromOpenPgpPacket,
  materialFromSshKey,
  rsaTypeFromPrime,
} from '../keyMaterial';

function prime(bytes: number, fill = 1): Uint8Array {
  return new Uint8Array(bytes).fill(fill);
}

describe('rsaTypeFromPrime', () => {
  it('maps p length to firmware RSA type 1–4', () => {
    expect(rsaTypeFromPrime(prime(64))).toBe(1);
    expect(rsaTypeFromPrime(prime(128))).toBe(2);
    expect(rsaTypeFromPrime(prime(192))).toBe(3);
    expect(rsaTypeFromPrime(prime(256))).toBe(4);
  });

  it('rejects sizes that are not 1024/2048/3072/4096', () => {
    expect(() => rsaTypeFromPrime(prime(20))).toThrow(/1024, 2048, 3072, or 4096/);
    expect(() => rsaTypeFromPrime(prime(129))).toThrow(/1024, 2048, 3072, or 4096/);
  });
});

describe('eccScalar32', () => {
  it('accepts 32-byte scalars and strips a 33-byte MPI leading zero', () => {
    const s = prime(32, 7);
    expect(eccScalar32(s)).toEqual(Array.from(s));
    expect(eccScalar32(Uint8Array.from([0, ...s]))).toEqual(Array.from(s));
    const startsWithZero = Uint8Array.from([0, ...prime(31, 7)]);
    expect(eccScalar32(startsWithZero)).toEqual(Array.from(startsWithZero));
  });

  it('rejects non-32-byte scalars', () => {
    expect(() => eccScalar32(prime(31))).toThrow(/32 bytes/);
  });
});

describe('materialFromOpenPgpPacket', () => {
  it('emits p||q and type 2 for a 2048-bit RSA packet', () => {
    const p = prime(128, 0xaa);
    const q = prime(128, 0xbb);
    const material = materialFromOpenPgpPacket({
      algorithm: 1,
      privateParams: { p, q, d: prime(256), u: prime(128) },
    });
    expect(material.kind).toBe('rsa');
    expect(material.type).toBe(2);
    expect(material.keyData).toHaveLength(256);
    expect(material.keyData.slice(0, 128)).toEqual(Array.from(p));
    expect(material.keyData.slice(128)).toEqual(Array.from(q));
  });

  it('emits a 32-byte ed25519 scalar as ECC type 1', () => {
    const seed = prime(32, 9);
    const material = materialFromOpenPgpPacket({
      algorithm: 'ed25519',
      privateParams: { seed },
    });
    expect(material).toEqual({ kind: 'ecc', type: 1, keyData: Array.from(seed) });
  });

  it('throws when privateParams are missing', () => {
    expect(() => materialFromOpenPgpPacket({ algorithm: 1, privateParams: null })).toThrow(
      /Could not read key parameters/,
    );
  });
});

describe('materialFromSshKey', () => {
  it('emits p||q for SSH RSA', () => {
    const p = prime(64, 1);
    const q = prime(64, 2);
    const material = materialFromSshKey({
      type: 'rsa',
      part: { p: { data: p }, q: { data: q } },
    });
    expect(material.type).toBe(1);
    expect(material.keyData).toEqual([...p, ...q]);
  });

  it('emits ed25519 k as a 32-byte scalar', () => {
    const k = prime(32, 3);
    const material = materialFromSshKey({
      type: 'ed25519',
      part: { k: { data: k } },
    });
    expect(material).toEqual({ kind: 'ecc', type: 1, keyData: Array.from(k) });
  });

  it('maps nistp256 SSH ECDSA to type 2', () => {
    const d = prime(32, 4);
    const material = materialFromSshKey({
      type: 'ecdsa',
      curve: 'nistp256',
      part: { d: { data: d } },
    });
    expect(material.type).toBe(2);
    expect(material.keyData).toEqual(Array.from(d));
  });
});

describe('applyPrivateKeyTypeModifiers', () => {
  it('ORs backup/signature/decryption flags', () => {
    expect(
      applyPrivateKeyTypeModifiers(2, 101, 'ecc', {
        setAsBackup: true,
        setAsSignature: true,
      }),
    ).toBe(2 | KEY_TYPE_BACKUP | KEY_TYPE_SIGNATURE);
  });

  it('marks RSA slot 1 decryption and slot 2 signature, stripping backup from slot 2', () => {
    expect(applyPrivateKeyTypeModifiers(2, 1, 'rsa', { setAsBackup: true })).toBe(
      2 | KEY_TYPE_DECRYPTION | KEY_TYPE_BACKUP,
    );
    expect(applyPrivateKeyTypeModifiers(2, 2, 'rsa', { setAsBackup: true })).toBe(
      2 | KEY_TYPE_SIGNATURE,
    );
  });
});
