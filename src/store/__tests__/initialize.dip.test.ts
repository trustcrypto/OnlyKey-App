import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeHidTransport } from '../../api/transport/ChromeHidTransport';
import { useDeviceStore } from '../useDeviceStore';
import { createMockDeviceClient, resetDeviceStoreForTests } from '../../test/store';

describe('useDeviceStore.initialize DIP', () => {
  beforeEach(async () => {
    await resetDeviceStoreForTests();
  });

  afterEach(async () => {
    await resetDeviceStoreForTests();
  });

  it('does not call chrome.hid when connecting a mock/injected device', async () => {
    const listPermitted = vi.spyOn(ChromeHidTransport, 'listPermittedDevices');
    const device = createMockDeviceClient({
      connect: vi.fn().mockRejectedValue(new Error('Device not found')),
    });

    await useDeviceStore.getState().initialize({ device, useMock: true });
    await useDeviceStore.getState().connect({ announce: false });

    expect(listPermitted).not.toHaveBeenCalled();
  });

  it('resumes pending firmware while in bootloader', async () => {
    const loadFirmwareBlocks = vi.fn().mockResolvedValue(undefined);
    const device = createMockDeviceClient({ loadFirmwareBlocks });
    sessionStorage.setItem('ok-pending-firmware', JSON.stringify(['aa', 'bb']));
    await useDeviceStore.getState().initialize({ device, useMock: true });
    useDeviceStore.setState({ isBootloader: true });
    await useDeviceStore.getState().resumePendingFirmware();
    expect(loadFirmwareBlocks).toHaveBeenCalledWith(['aa', 'bb']);
    expect(sessionStorage.getItem('ok-pending-firmware')).toBeNull();
  });

  it('uses the injected listPermittedDevices on Device not found', async () => {
    const listPermittedDevices = vi.fn().mockResolvedValue([
      { vendorId: 0x1d50, productId: 0x60fc, productName: 'OnlyKey' },
    ]);
    const device = createMockDeviceClient({
      connect: vi.fn().mockRejectedValue(new Error('Device not found')),
    });

    await useDeviceStore.getState().initialize({ device, listPermittedDevices });
    await useDeviceStore.getState().connect({ announce: false });

    expect(listPermittedDevices).toHaveBeenCalled();
  });
});
