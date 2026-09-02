import { DeviceType } from '../api/device/types';

/** User-facing product name. Full-size hardware is OnlyKey, not Classic. */
export function deviceProductName(deviceType: DeviceType): string {
  return deviceType === DeviceType.DUO ? 'OnlyKey DUO' : 'OnlyKey';
}

/** Sidebar / footer line: product plus firmware version. */
export function connectedDeviceLabel(deviceType: DeviceType, version: string): string {
  const name = deviceProductName(deviceType);
  if (deviceType === DeviceType.UNINITIALIZED) return `${name} (uninitialized)`;
  const v = version.trim();
  return v ? `${name} ${v}` : name;
}
