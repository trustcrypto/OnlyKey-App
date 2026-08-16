import { describe, it, expect } from 'vitest';
import { sha256 } from 'js-sha256';
import { base64ToHex, hexStringToByteArray, arrayToHexString } from '../../api/device/utils';
import { verifyBackupData } from '../backupVerify';

describe('verifyBackupData', () => {
  it('should reject empty backup data', () => {
    const result = verifyBackupData('');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('should reject backup without verification hash line', () => {
    const result = verifyBackupData('-----BEGIN ONLYKEY BACKUP-----\nYWJj\n-----END ONLYKEY BACKUP-----');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('does not support verification');
  });

  it('accepts a backup whose trailing hash line matches', () => {
    const payload = btoa('Hi');
    const hash = sha256.create();
    hash.update(new Uint8Array(32).fill(0));
    hash.update(hexStringToByteArray(base64ToHex(payload)));
    const digest = new Uint8Array(hash.array());
    const hashB64 = btoa(String.fromCharCode(...digest));
    expect(arrayToHexString(digest)).toHaveLength(64);

    const result = verifyBackupData(`-----BEGIN ONLYKEY BACKUP-----\n${payload}\n--${hashB64}\n-----END ONLYKEY BACKUP-----`);
    expect(result.valid).toBe(true);
    expect(result.message).toMatch(/verified/i);
  });
});