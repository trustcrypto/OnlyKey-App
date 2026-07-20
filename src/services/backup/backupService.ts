import type { DeviceClient } from '../../api/device/DeviceClient';
import { parseBackupData } from '../../api/device/utils';

export async function restoreBackupFromFile(device: DeviceClient, file: File): Promise<void> {
  const hexData = parseBackupData(await file.text());
  if (!hexData) throw new Error('Could not parse backup file.');
  await device.restore(hexData);
}