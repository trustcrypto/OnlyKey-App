import { describe, expect, it, vi } from 'vitest';
import { restoreBackupFromFile } from '../backupService';

describe('restoreBackupFromFile', () => {
  it('parses backup text and sends hex to the device', async () => {
    const restore = vi.fn().mockResolvedValue(undefined);
    const onProgress = vi.fn();
    const file = { text: async () => '-- header\nSGk=\n' } as File;

    await restoreBackupFromFile({ restore } as never, file, onProgress);

    expect(restore).toHaveBeenCalledWith('4869', onProgress);
  });

  it('throws when the file has no payload', async () => {
    const file = { text: async () => '-- only comments\n\n' } as File;
    await expect(restoreBackupFromFile({ restore: vi.fn() } as never, file)).rejects.toThrow(
      /Could not parse backup file/
    );
  });
});
