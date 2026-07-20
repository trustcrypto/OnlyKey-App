import { isOpenPgpKey, isSshKey, KEY_SLOTS } from '../../api/device/keySlots';
import { loadSshpk } from '../../api/device/sshpkNode';
import { KeyCandidate, KeyImportResult } from './types';

const AUTO_LOAD_SLOT = 99;
const SIGNING_SLOT = 2;
const DECRYPTION_SLOT = 1;

function rsaTypeFromKeyData(keyData: number[]): number {
  // v5: type = p.length / 64 (1024/2048/3072/4096 bit)
  const estimatedBits = keyData.length * 8;
  if (estimatedBits <= 128) return 1;
  if (estimatedBits <= 256) return 2;
  if (estimatedBits <= 384) return 3;
  return 4;
}

async function parseSshBundle(pem: string, passcode: string): Promise<KeyCandidate[]> {
  const key = loadSshpk().parsePrivateKey(pem, 'pem', { passphrase: passcode || undefined });
  const der = key.toBuffer('pkcs1');
  const keyData = Array.from(der);
  const type = key.type === 'ecdsa' || key.type === 'ed25519' ? 2 : rsaTypeFromKeyData(keyData);

  return [{ id: '0', name: 'Primary Key', type, keyData }];
}

async function parseOpenPgpBundle(pem: string, passcode: string): Promise<KeyCandidate[]> {
  if (!passcode) throw new Error('Passcode is required for OpenPGP keys.');

  const openpgp = await import('openpgp');
  const privateKey = await openpgp.readPrivateKey({ armoredKey: pem });
  const decrypted = await openpgp.decryptKey({ privateKey, passphrase: passcode });

  const candidates: KeyCandidate[] = [];

  const addPacket = (packet: { write: () => Uint8Array; algorithm?: string }, name: string, id: string) => {
    const raw = packet.write();
    const keyData = Array.from(new Uint8Array(raw));
    const isRsa = packet.algorithm?.toLowerCase().includes('rsa') ?? keyData.length > 128;
    candidates.push({
      id,
      name,
      type: isRsa ? rsaTypeFromKeyData(keyData) : 2,
      keyData,
    });
  };

  if (decrypted.keyPacket) {
    addPacket(decrypted.keyPacket, 'Primary Key', '0');
  }

  decrypted.subkeys.forEach((subkey, index) => {
    if (subkey.keyPacket) {
      addPacket(subkey.keyPacket, `Subkey ${index + 1}`, String(index + 1));
    }
  });

  if (!candidates.length) {
    throw new Error('No private key material found in OpenPGP key.');
  }

  return candidates;
}

function buildAutoAssignments(candidates: KeyCandidate[]): KeyImportResult['assignments'] {
  if (candidates.length < 2) {
    const candidate = candidates[0];
    const slot = candidate.type === 1 ? SIGNING_SLOT : KEY_SLOTS.ecc[0];
    return [{ candidate, slot }];
  }

  const signingKey = candidates.length > 2 ? candidates[2] : candidates[0];
  const decryptionKey = candidates[1];
  const assignments = [{ candidate: signingKey, slot: SIGNING_SLOT }];
  if (decryptionKey) assignments.push({ candidate: decryptionKey, slot: DECRYPTION_SLOT });
  return assignments;
}

export async function parseKeyBundle(
  pem: string,
  passcode: string,
  slotChoice: number
): Promise<KeyImportResult> {
  const trimmed = pem.trim();
  let candidates: KeyCandidate[];

  if (isSshKey(trimmed)) {
    candidates = await parseSshBundle(trimmed, passcode);
  } else if (isOpenPgpKey(trimmed)) {
    candidates = await parseOpenPgpBundle(trimmed, passcode);
  } else {
    throw new Error('Unsupported key format. Use PEM OpenPGP or SSH private keys.');
  }

  const autoLoad = slotChoice === AUTO_LOAD_SLOT;
  const requiresSelection = !autoLoad && candidates.length > 1;

  if (autoLoad || candidates.length < 2) {
    const assignments = autoLoad
      ? buildAutoAssignments(candidates)
      : [{ candidate: candidates[0], slot: slotChoice === AUTO_LOAD_SLOT ? SIGNING_SLOT : slotChoice }];
    return { assignments, requiresSelection: false, candidates };
  }

  return { assignments: [], requiresSelection, candidates };
}