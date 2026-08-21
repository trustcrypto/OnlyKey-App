import { sha256 } from 'js-sha256';
import { ECC_SLOTS, RSA_SLOTS, isSshKey } from './keySlots';
import { materialFromOpenPgpPacket, materialFromSshKey } from './keyMaterial';
import { loadSshpk } from './sshpkNode';

export { ECC_SLOTS, KEY_SLOTS, RSA_SLOTS, isOpenPgpKey, isSshKey } from './keySlots';
export {
  KEY_TYPE_BACKUP,
  KEY_TYPE_DECRYPTION,
  KEY_TYPE_SIGNATURE,
  applyPrivateKeyTypeModifiers,
} from './keyMaterial';

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
  const material = materialFromSshKey(key);
  const slot =
    slotChoice === 99
      ? material.kind === 'ecc'
        ? ECC_SLOTS[0]
        : RSA_SLOTS[0]
      : slotChoice;
  return { slot, type: material.type, keyData: material.keyData };
}

async function parseOpenPgpKey(pem: string, passcode: string, slotChoice: number): Promise<ParsedKey> {
  if (!passcode) {
    throw new Error('Passcode is required for OpenPGP keys.');
  }

  const openpgp = await import('openpgp');
  const privateKey = await openpgp.readPrivateKey({ armoredKey: pem });
  const decrypted = await openpgp.decryptKey({ privateKey, passphrase: passcode });

  const keyPacket = decrypted.keyPacket;
  if (!keyPacket || !('privateParams' in keyPacket)) {
    throw new Error('Could not read key parameters from OpenPGP key.');
  }

  const material = materialFromOpenPgpPacket(keyPacket);
  const slot =
    slotChoice === 99
      ? material.kind === 'rsa'
        ? RSA_SLOTS[0]
        : ECC_SLOTS[0]
      : slotChoice;
  return { slot, type: material.type, keyData: material.keyData };
}

export function hashBackupPassphrase(passphrase: string): number[] {
  return sha256.array(passphrase);
}
