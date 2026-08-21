import { waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceType } from '../../api/device/types';
import { useDeviceStore } from '../useDeviceStore';
import { createMockDeviceClient, resetDeviceStoreForTests } from '../../test/store';
import * as firmwareCheck from '../../desktop/firmwareCheck';

describe('useDeviceStore remaining branches', () => {
  beforeEach(async () => {
    await resetDeviceStoreForTests();
    vi.stubGlobal('confirm', vi.fn(() => false));
  });

  afterEach(async () => {
    await resetDeviceStoreForTests();
  });

  it('clamps working progress and clears errors', () => {
    const store = useDeviceStore.getState();
    store.setWorking(true, 'Saving', 150);
    expect(useDeviceStore.getState().workingProgress).toBe(100);
    store.setWorking(true, undefined, -5);
    expect(useDeviceStore.getState().workingMessage).toBe('Please wait…');
    expect(useDeviceStore.getState().workingProgress).toBe(0);
    store.setWorking(false);
    expect(useDeviceStore.getState().workingProgress).toBeNull();
    useDeviceStore.setState({ error: 'x', pinError: 'y', showUdevDialog: true, duoProfile: 'purple' });
    store.clearError();
    store.clearPinError();
    store.dismissUdevDialog();
    store.setDuoProfile('blue');
    expect(useDeviceStore.getState()).toMatchObject({
      error: null,
      pinError: null,
      showUdevDialog: false,
      duoProfile: 'blue',
    });
  });

  it('refreshLabels no-ops when locked and runs when unlocked', async () => {
    const getLabels = vi.fn().mockResolvedValue(undefined);
    const device = createMockDeviceClient({ getLabels });
    await useDeviceStore.getState().initialize({ device });
    useDeviceStore.setState({ isConnected: true, isLocked: true });
    await useDeviceStore.getState().refreshLabels();
    expect(getLabels).not.toHaveBeenCalled();
    useDeviceStore.setState({ isLocked: false });
    await useDeviceStore.getState().refreshLabels();
    expect(getLabels).toHaveBeenCalled();
  });

  it('records firmware resume errors and disconnects the client', async () => {
    const loadFirmwareBlocks = vi.fn().mockRejectedValue(new Error('flash failed'));
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const device = createMockDeviceClient({ loadFirmwareBlocks, disconnect });
    sessionStorage.setItem('ok-pending-firmware', JSON.stringify(['aa']));
    await useDeviceStore.getState().initialize({ device });
    useDeviceStore.setState({ isBootloader: true });
    await useDeviceStore.getState().resumePendingFirmware();
    expect(useDeviceStore.getState().error).toBe('flash failed');
    await useDeviceStore.getState().disconnect();
    expect(disconnect).toHaveBeenCalled();
  });

  it('announces connect failure and shows a udev dialog on linux permission errors', async () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    const device = createMockDeviceClient({
      connect: vi.fn().mockRejectedValue(new Error('Access denied opening hid')),
    });
    await useDeviceStore.getState().initialize({ device });
    await useDeviceStore.getState().connect({ announce: true });
    expect(useDeviceStore.getState().showUdevDialog).toBe(true);
    expect(useDeviceStore.getState().error).toMatch(/access denied/i);
    expect(useDeviceStore.getState().isConnecting).toBe(false);
  });

  it('routes PIN errors separately from generic device errors', async () => {
    const listeners: Record<string, Function> = {};
    const device = createMockDeviceClient({
      on: vi.fn((event: string, fn: Function) => {
        listeners[event] = fn;
        return device;
      }),
    });
    await useDeviceStore.getState().initialize({ device });
    useDeviceStore.setState({ isConnected: true });
    listeners.error?.('Incorrect PIN');
    expect(useDeviceStore.getState().pinError).toMatch(/incorrect pin/i);
    listeners.error?.('slot write failed');
    expect(useDeviceStore.getState().error).toBe('slot write failed');
    listeners.error?.('password attempts for this session exceeded');
    expect(useDeviceStore.getState().pinError).toMatch(/password attempts/i);
  });

  it('applies label and message events and prompts for a firmware update', async () => {
    vi.spyOn(firmwareCheck, 'checkForNewFirmware').mockResolvedValue({
      updateAvailable: true,
      currentVersion: 'v2.1.0',
      latestVersion: 'v3.0.4',
      fwUpdateSupport: true,
    });
    vi.stubGlobal('confirm', vi.fn(() => true));
    const listeners: Record<string, Function> = {};
    const device = createMockDeviceClient({
      on: vi.fn((event: string, fn: Function) => {
        listeners[event] = fn;
        return device;
      }),
    });
    await useDeviceStore.getState().initialize({ device });
    useDeviceStore.setState({ isConnected: true, isLocked: false });
    listeners.labelUpdate?.(1, 'Mail');
    expect(useDeviceStore.getState().labels[1]).toBe('Mail');
    listeners.labelsRefreshed?.(new Map([[2, 'Work']]));
    expect(useDeviceStore.getState().labels[2]).toBe('Work');
    listeners.messageReceived?.('hello from device');
    expect(useDeviceStore.getState().recentMessages[0]).toBe('hello from device');
    await listeners.statusChange?.({
      isConnected: true,
      isLocked: false,
      isConfigMode: false,
      isBootloader: false,
      deviceType: DeviceType.CLASSIC,
      deviceTypeSource: 'status',
      usbProductId: 0x0486,
      maxLabelSlot: 12,
      lastStatusText: 'UNLOCKEDv2.1.0',
      version: 'v2.1.0',
      devicePinSet: true,
      labels: new Map(),
    });
    await waitFor(() => {
      expect(useDeviceStore.getState().activeTab).toBe('firmware');
    });
  });

  it('initialize(true) uses a mock transport and is idempotent', async () => {
    await useDeviceStore.getState().initialize(true);
    const first = useDeviceStore.getState().device;
    expect(first).toBeTruthy();
    await useDeviceStore.getState().initialize(true);
    expect(useDeviceStore.getState().device).toBe(first);
  });

  it('logs other permitted HID devices when the OnlyKey filter is empty', async () => {
    const listPermittedDevices = vi.fn().mockResolvedValue([
      { vendorId: 1, productId: 2, productName: 'other' },
    ]);
    const device = createMockDeviceClient({
      connect: vi.fn().mockRejectedValue(new Error('Device not found')),
    });
    await useDeviceStore.getState().initialize({ device, listPermittedDevices });
    useDeviceStore.setState({ isConnected: true, sessionEpoch: 4 });
    await useDeviceStore.getState().connect({ announce: false });
    expect(listPermittedDevices).toHaveBeenCalled();
    expect(useDeviceStore.getState().isConnected).toBe(false);
  });
});
