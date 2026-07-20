import { describe, it, expect } from 'vitest';
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
});