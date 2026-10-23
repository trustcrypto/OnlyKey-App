import type { DeviceClient } from '../../api/device/DeviceClient';

export async function wipeKeyInSlot(device: DeviceClient, slot: number): Promise<void> {
  const wipeSlot = slot === 99 ? 1 : slot;
  await device.wipePrivateKey(wipeSlot);
}