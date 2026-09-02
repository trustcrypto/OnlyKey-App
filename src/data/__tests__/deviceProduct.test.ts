import { describe, expect, it } from 'vitest';
import { DeviceType } from '../../api/device/types';
import { connectedDeviceLabel, deviceProductName } from '../deviceProduct';

describe('deviceProduct', () => {
  it('names full-size hardware OnlyKey, not Classic', () => {
    expect(deviceProductName(DeviceType.CLASSIC)).toBe('OnlyKey');
    expect(deviceProductName(DeviceType.UNKNOWN)).toBe('OnlyKey');
    expect(deviceProductName(DeviceType.DUO)).toBe('OnlyKey Duo');
  });

  it('does not print the classic enum in the connected label', () => {
    expect(connectedDeviceLabel(DeviceType.CLASSIC, 'v3.0.4-testc')).toBe('OnlyKey v3.0.4-testc');
    expect(connectedDeviceLabel(DeviceType.DUO, 'v3.0.4-prodp')).toBe('OnlyKey Duo v3.0.4-prodp');
    expect(connectedDeviceLabel(DeviceType.UNINITIALIZED, 'v2.1.0-prod')).toBe(
      'OnlyKey (uninitialized)',
    );
    expect(connectedDeviceLabel(DeviceType.BOOTLOADER, 'v1')).toBe('OnlyKey (bootloader v1)');
    expect(connectedDeviceLabel(DeviceType.BOOTLOADER, 'BOOTLOADERv1')).toBe(
      'OnlyKey (bootloader v1)',
    );
  });
});
