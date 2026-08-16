import { sha256 } from 'js-sha256';
import { ECC_SLOTS, RSA_SLOTS, isSshKey } from './keySlots';
import { loadSshpk } from './sshpkNode';

export { ECC_SLOTS, KEY_SLOTS, RSA_SLOTS, isOpenPgpKey, isSshKey } from './keySlots';

export interface ParsedKey {
  slot: number;
  type: number;
  keyData: number[];
}

export async function parsePrivateKey(
  pem: string,
  passcode: string,
  slotChoice: number
): Promise<ParsedKey> {
  if (isSshKey(pem)) {
    return parseSshKey(pem, passcode, slotChoice);
  }
  return parseOpenPgpKey(pem, passcode, slotChoice);
}

function parseSshKey(pem: string, passcode: string, slotChoice: number): ParsedKey {
  const key = loadSshpk().parsePrivateKey(pem, 'pem', { passphrase: passcode || undefined });
  const der = key.toBuffer('pkcs1');
  const keyData = Array.from(der);

  let slot = slotChoice;
  let type = 1;

  if (key.type === 'ecdsa' || key.type === 'ed25519') {
    type = 2;
    slot = slotChoice === 99 ? ECC_SLOTS[0] : slotChoice;
  } else {
    slot = slotChoice === 99 ? RSA_SLOTS[0] : slotChoice;
  }

  return { slot, type, keyData };
}

async function parseOpenPgpKey(pem: string, passcode: string, slotChoice: number): Promise<ParsedKey> {
  if (!passcode) {
    throw new Error('Passcode is required for OpenPGP keys.');
  }

  const openpgp = await import('openpgp');
  const privateKey = await openpgp.readPrivateKey({ armoredKey: pem });
  const decrypted = await openpgp.decryptKey({ privateKey, passphrase: passcode });

  const keyPacket = decrypted.keyPacket;
  if (!keyPacket) {
    throw new Error('Could not read key parameters from OpenPGP key.');
  }

  const isRsa = keyPacket.algorithm === 1;
  const slot = slotChoice === 99 ? (isRsa ? RSA_SLOTS[0] : ECC_SLOTS[0]) : slotChoice;
  const type = isRsa ? 1 : 2;

  const raw = keyPacket.write();
  const keyData = Array.from(new Uint8Array(raw));

  return { slot, type, keyData };
}

export function hashBackupPassphrase(passphrase: string): number[] {
  return sha256.array(passphrase);
}