import { describe, expect, it, vi } from 'vitest';
import { wipeKeyInSlot } from '../keyService';

describe('wipeKeyInSlot', () => {
  it('wipes the requested slot', async () => {
    const wipePrivateKey = vi.fn().mockResolvedValue(undefined);
    await wipeKeyInSlot({ wipePrivateKey } as never, 3);
    expect(wipePrivateKey).toHaveBeenCalledWith(3);
  });

  it('maps auto-load slot 99 to RSA slot 1', async () => {
    const wipePrivateKey = vi.fn().mockResolvedValue(undefined);
    await wipeKeyInSlot({ wipePrivateKey } as never, 99);
    expect(wipePrivateKey).toHaveBeenCalledWith(1);
  });
});
