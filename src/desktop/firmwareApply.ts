import type { DeviceClient } from '../api/device/DeviceClient';
import { clearPendingFirmware, storePendingFirmware } from './firmwareCheck';
import { FirmwareUpdateError } from './firmwareDownload';

export async function applyFirmwareBlocks(opts: {
  device: DeviceClient;
  blocks: string[];
  isBootloader: boolean;
  setWorking: (active: boolean, message?: string, progress?: number | null) => void;
}): Promise<'streamed' | 'pending-reboot'> {
  const { device, blocks, isBootloader, setWorking } = opts;
  if (!blocks.length) {
    throw new FirmwareUpdateError('Could not parse firmware file.', 'invalid-firmware');
  }

  if (isBootloader) {
    // Leftover pending would reflash on the next bootloader PID.
    clearPendingFirmware();
    setWorking(true, 'Loading firmware… 0%', 0);
    try {
      await device.loadFirmwareBlocks(blocks, (pct) => {
        setWorking(true, `Loading firmware… ${Math.round(pct)}%`, pct);
      });
    } finally {
      setWorking(false);
    }
    return 'streamed';
  }

  setWorking(true, 'Triggering reboot to bootloader — do not remove OnlyKey…');
  try {
    await device.triggerBootloader();
  } catch (err) {
    clearPendingFirmware();
    setWorking(false);
    throw err;
  }
  storePendingFirmware(blocks);
  setWorking(false);
  return 'pending-reboot';
}
