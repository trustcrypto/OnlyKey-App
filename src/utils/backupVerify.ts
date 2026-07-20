import { sha256 } from 'js-sha256';
import { base64ToHex, hexStringToByteArray, arrayToHexString } from '../api/device/utils';

export interface BackupVerifyResult {
  valid: boolean;
  error?: string;
  message?: string;
}

export function verifyBackupData(backupData: string): BackupVerifyResult {
  const trimmed = backupData.trim();
  if (!trimmed) {
    return { valid: false, error: 'Backup data cannot be empty.' };
  }

  try {
    let backupHash = new Uint8Array(32).fill(0);
    let supportsVerification = false;

    for (const line of trimmed.split('\n')) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (!trimmedLine.includes('--')) {
        const valueToHash = hexStringToByteArray(base64ToHex(trimmedLine));
        const hash = sha256.create();
        hash.update(backupHash);
        hash.update(valueToHash);
        backupHash = new Uint8Array(hash.array());
      } else if (!trimmedLine.includes('BACKUP')) {
        const fileBackupHash = base64ToHex(trimmedLine.slice(2)).toUpperCase();
        const computed = arrayToHexString(backupHash);
        supportsVerification = true;

        if (fileBackupHash === computed) {
          return { valid: true, message: 'Successfully verified backup SHA256 hash' };
        }
        return { valid: false, error: 'This backup file is corrupt.' };
      }
    }

    if (!supportsVerification) {
      return { valid: false, error: 'This backup file does not support verification.' };
    }

    return { valid: false, error: 'This backup file is corrupt.' };
  } catch {
    return { valid: false, error: 'This backup file is corrupt.' };
  }
}