import { DeviceType } from '../api/device/types';

/** User-facing product name. Full-size hardware is OnlyKey, not Classic. */
export function deviceProductName(deviceType: DeviceType): string {
  return deviceType === DeviceType.DUO ? 'OnlyKey Duo' : 'OnlyKey';
}

/** Sidebar / footer line: product plus firmware version. */
export function connectedDeviceLabel(deviceType: DeviceType, version: string): string {
  const name = deviceProductName(deviceType);
  if (deviceType === DeviceType.UNINITIALIZED) return `${name} (uninitialized)`;
  if (deviceType === DeviceType.BOOTLOADER) {
    const v = version.replace(/BOOTLOADER/gi, '').trim();
    return v ? `${name} (bootloader ${v})` : `${name} (bootloader)`;
  }
  const v = version.trim();
  return v ? `${name} ${v}` : name;
}
