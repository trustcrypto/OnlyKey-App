import { DeviceType } from '../api/device/types';

/** User-facing product name. Full-size hardware is OnlyKey, not Classic. */
export function deviceProductName(deviceType: DeviceType): string {
  return deviceType === DeviceType.DUO ? 'OnlyKey Duo' : 'OnlyKey';
}

/** Sidebar / footer line: product plus firmware version. */
export function connectedDeviceLabel(
  deviceType: DeviceType,
  version: string,
  isInitialized = true,
): string {
  const name = deviceProductName(deviceType);
  if (deviceType === DeviceType.BOOTLOADER) {
    const v = version.replace(/BOOTLOADER/gi, '').trim();
    return v ? `${name} (bootloader ${v})` : `${name} (bootloader)`;
  }
  if (!isInitialized || deviceType === DeviceType.UNINITIALIZED) {
    const v = version.trim();
    if (deviceType === DeviceType.UNINITIALIZED || !v) return `${name} (uninitialized)`;
    return `${name} ${v} (uninitialized)`;
  }
  const v = version.trim();
  return v ? `${name} ${v}` : name;
}
