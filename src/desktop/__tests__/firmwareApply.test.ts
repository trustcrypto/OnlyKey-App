import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirmwareUpdateError } from '../firmwareDownload';
import { getPendingFirmware } from '../firmwareCheck';
import { applyFirmwareBlocks } from '../firmwareApply';
import { createMockDeviceClient } from '../../test/store';

describe('applyFirmwareBlocks', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('A1: bootloader streams blocks and clears pending', async () => {
    const loadFirmwareBlocks = vi.fn(
      async (_blocks: string[], onProgress?: (pct: number) => void) => {
        onProgress?.(40);
      },
    );
    const triggerBootloader = vi.fn();
    const device = createMockDeviceClient({ loadFirmwareBlocks, triggerBootloader });
    sessionStorage.setItem('ok-pending-firmware', JSON.stringify(['stale']));
    const setWorking = vi.fn();

    await expect(
      applyFirmwareBlocks({
        device,
        blocks: ['aa', 'bb'],
        isBootloader: true,
        setWorking,
      }),
    ).resolves.toBe('streamed');

    expect(loadFirmwareBlocks).toHaveBeenCalledWith(['aa', 'bb'], expect.any(Function));
    expect(triggerBootloader).not.toHaveBeenCalled();
    expect(getPendingFirmware()).toBeNull();
    expect(setWorking).toHaveBeenCalledWith(true, 'Loading firmware… 0%', 0);
    expect(setWorking).toHaveBeenCalledWith(true, 'Loading firmware… 40%', 40);
    expect(setWorking).toHaveBeenLastCalledWith(false);
  });

  it('A2: not bootloader, kick ok → pending-reboot and pending stored', async () => {
    const device = createMockDeviceClient();
    const setWorking = vi.fn();

    await expect(
      applyFirmwareBlocks({
        device,
        blocks: ['aa'],
        isBootloader: false,
        setWorking,
      }),
    ).resolves.toBe('pending-reboot');

    expect(device.triggerBootloader).toHaveBeenCalledTimes(1);
    expect(device.loadFirmwareBlocks).not.toHaveBeenCalled();
    expect(getPendingFirmware()).toEqual(['aa']);
    expect(setWorking).toHaveBeenCalledWith(
      true,
      'Triggering reboot to bootloader — do not remove OnlyKey…',
    );
    expect(setWorking).toHaveBeenLastCalledWith(false);
  });

  it('A3: kick throws config-mode → pending not stored and working cleared', async () => {
    const triggerBootloader = vi.fn().mockRejectedValue(new Error('Error: Not in Config Mode'));
    const loadFirmwareBlocks = vi.fn();
    const device = createMockDeviceClient({ triggerBootloader, loadFirmwareBlocks });
    sessionStorage.setItem('ok-pending-firmware', JSON.stringify(['stale']));
    const setWorking = vi.fn();

    await expect(
      applyFirmwareBlocks({
        device,
        blocks: ['aa'],
        isBootloader: false,
        setWorking,
      }),
    ).rejects.toThrow(/not in config mode/i);

    expect(triggerBootloader).toHaveBeenCalledTimes(1);
    expect(loadFirmwareBlocks).not.toHaveBeenCalled();
    expect(getPendingFirmware()).toBeNull();
    expect(setWorking).toHaveBeenCalledWith(false);
  });

  it('A4: empty blocks → invalid-firmware and no HID', async () => {
    const device = createMockDeviceClient();
    const setWorking = vi.fn();

    await expect(
      applyFirmwareBlocks({
        device,
        blocks: [],
        isBootloader: false,
        setWorking,
      }),
    ).rejects.toMatchObject({
      name: 'FirmwareUpdateError',
      code: 'invalid-firmware',
    });
    await expect(
      applyFirmwareBlocks({
        device,
        blocks: [],
        isBootloader: true,
        setWorking,
      }),
    ).rejects.toBeInstanceOf(FirmwareUpdateError);

    expect(device.triggerBootloader).not.toHaveBeenCalled();
    expect(device.loadFirmwareBlocks).not.toHaveBeenCalled();
    expect(setWorking).not.toHaveBeenCalled();
    expect(getPendingFirmware()).toBeNull();
  });
});
