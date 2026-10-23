/** Firmware OKSETPRIV type modifiers (OnlyKeyComm.keyTypeModifiers). */
export const KEY_TYPE_BACKUP = 128;
export const KEY_TYPE_SIGNATURE = 64;
export const KEY_TYPE_DECRYPTION = 32;

export interface OnlyKeyKeyMaterial {
  type: number;
  keyData: number[];
  kind: 'rsa' | 'ecc';
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (value && typeof value === 'object' && 'data' in value) {
    return asBytes((value as { data: unknown }).data);
  }
  throw new Error('Invalid key parameter encoding.');
}

function stripLeadingZeros(bytes: Uint8Array): Uint8Array {
  let i = 0;
  while (i < bytes.length - 1 && bytes[i] === 0) i += 1;
  return bytes.subarray(i);
}

/** RSA type byte: 1=1024, 2=2048, 3=3072, 4=4096 (p.length / 64). */
export function rsaTypeFromPrime(p: Uint8Array): number {
  const type = Math.floor(p.length / 64);
  if (![1, 2, 3, 4].includes(type) || p.length !== type * 64) {
    throw new Error('Selected key length should be 1024, 2048, 3072, or 4096 bits.');
  }
  return type;
}

export function eccScalar32(raw: Uint8Array): number[] {
  // MPIs may be 33 bytes with a leading 0; a 32-byte scalar may itself start with 0.
  const s = raw.length > 32 ? stripLeadingZeros(raw) : raw;
  if (s.length !== 32) {
    throw new Error('Selected key length should be 32 bytes.');
  }
  return Array.from(s);
}

function isRsaAlgorithm(algorithm: unknown): boolean {
  if (typeof algorithm === 'number') return algorithm === 1 || algorithm === 2 || algorithm === 3;
  const s = String(algorithm ?? '').toLowerCase();
  return s.includes('rsa');
}

function eccTypeFromAlgorithm(algorithm: unknown, curve?: string): number {
  const s = `${algorithm ?? ''} ${curve ?? ''}`.toLowerCase();
  if (s.includes('secp256k1') || /(^|[^a-z0-9])k256([^a-z0-9]|$)/.test(s)) {
    return 3;
  }
  if (
    s.includes('ed25519') ||
    s.includes('x25519') ||
    s.includes('curve25519') ||
    s.includes('eddsa')
  ) {
    return 1;
  }
  if (
    s.includes('nist') ||
    s.includes('secp256r1') ||
    s.includes('prime256v1') ||
    /(^|[^a-z0-9])p-?256([^a-z0-9]|$)/.test(s)
  ) {
    return 2;
  }
  if (algorithm === 22 || algorithm === 27 || algorithm === 25) return 1;
  throw new Error('Unsupported ECC key type, key is not X25519, NIST256p1, or secp256k1.');
}

export function materialFromOpenPgpPacket(packet: {
  algorithm?: unknown;
  privateParams?: object | null;
  getAlgorithmInfo?: () => { algorithm: string; curve?: string };
}): OnlyKeyKeyMaterial {
  const priv = packet.privateParams as Record<string, unknown> | null | undefined;
  if (!priv) {
    throw new Error('Could not read key parameters from OpenPGP key.');
  }
  const algoInfo = packet.getAlgorithmInfo?.();
  const algorithm = algoInfo?.algorithm ?? packet.algorithm;

  if (isRsaAlgorithm(algorithm) || ('p' in priv && 'q' in priv && priv.p && priv.q)) {
    const p = stripLeadingZeros(asBytes(priv.p));
    const q = stripLeadingZeros(asBytes(priv.q));
    return { kind: 'rsa', type: rsaTypeFromPrime(p), keyData: [...p, ...q] };
  }

  const scalar = priv.seed ?? priv.d ?? priv.k;
  if (scalar === undefined || scalar === null) {
    throw new Error('Could not read key parameters from OpenPGP key.');
  }
  return {
    kind: 'ecc',
    type: eccTypeFromAlgorithm(algorithm, algoInfo?.curve),
    keyData: eccScalar32(asBytes(scalar)),
  };
}

export function materialFromSshKey(key: {
  type: string;
  curve?: string;
  part: Record<string, { data: Uint8Array } | undefined>;
}): OnlyKeyKeyMaterial {
  if (key.type === 'rsa') {
    if (!key.part.p?.data || !key.part.q?.data) {
      throw new Error('SSH RSA key is missing p/q.');
    }
    const p = stripLeadingZeros(asBytes(key.part.p.data));
    const q = stripLeadingZeros(asBytes(key.part.q.data));
    return { kind: 'rsa', type: rsaTypeFromPrime(p), keyData: [...p, ...q] };
  }
  if (key.type === 'ed25519') {
    const s = key.part.k?.data;
    if (!s) throw new Error('SSH ed25519 key is missing private scalar.');
    return { kind: 'ecc', type: 1, keyData: eccScalar32(asBytes(s)) };
  }
  if (key.type === 'ecdsa') {
    const s = key.part.d?.data;
    if (!s) throw new Error('SSH ECDSA key is missing private scalar.');
    return {
      kind: 'ecc',
      type: eccTypeFromAlgorithm('ecdsa', key.curve),
      keyData: eccScalar32(asBytes(s)),
    };
  }
  throw new Error('Unsupported SSH key type.');
}

/** Combine size/curve type with Backup/Signature/Decryption flags. Auto Load only tags RSA 1/2 purpose and strips backup from the signature slot. */
export function applyPrivateKeyTypeModifiers(
  baseType: number,
  slot: number,
  kind: 'rsa' | 'ecc',
  flags: {
    setAsBackup?: boolean;
    setAsSignature?: boolean;
    setAsDecryption?: boolean;
    autoLoad?: boolean;
  } = {},
): number {
  let type = baseType;
  if (flags.setAsDecryption) type |= KEY_TYPE_DECRYPTION;
  if (flags.setAsSignature) type |= KEY_TYPE_SIGNATURE;
  if (flags.setAsBackup) type |= KEY_TYPE_BACKUP;
  if (flags.autoLoad) {
    if (kind === 'rsa') {
      if (slot === 1) type |= KEY_TYPE_DECRYPTION;
      if (slot === 2) type |= KEY_TYPE_SIGNATURE;
    }
    if (slot === 2 || slot === 102) type &= ~KEY_TYPE_BACKUP;
  }
  return type;
}
