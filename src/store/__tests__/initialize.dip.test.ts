import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeHidTransport } from '../../api/transport/ChromeHidTransport';
import { DeviceType } from '../../api/device/types';
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

  it('does not treat INITIALIZED during connect as an unplug', async () => {
    const listeners: Record<string, Function> = {};
    let releaseConnect!: () => void;
    const connectGate = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    const device = createMockDeviceClient({
      connect: vi.fn().mockImplementation(() => connectGate),
      on: vi.fn((event: string, fn: Function) => {
        listeners[event] = fn;
        return device;
      }),
    });
    const init = useDeviceStore.getState().initialize({ device, useMock: true });
    await vi.waitFor(() => expect(listeners.statusChange).toBeTypeOf('function'));
    listeners.statusChange?.({
      isConnected: false,
      isLocked: true,
      isConfigMode: false,
      isBootloader: false,
      deviceType: DeviceType.CLASSIC,
      deviceTypeSource: 'status',
      usbProductId: 0x0486,
      maxLabelSlot: 0,
      lastStatusText: 'INITIALIZED',
      version: 'v2.1.0',
      devicePinSet: true,
      labels: new Map(),
    });
    expect(useDeviceStore.getState().device).toBe(device);
    expect(useDeviceStore.getState().isConnected).toBe(false);
    releaseConnect();
    await init;
  });

  it('treats an empty snapshot during connect as a real unplug', async () => {
    const listeners: Record<string, Function> = {};
    let releaseConnect!: () => void;
    const connectGate = new Promise<void>((resolve) => {
      releaseConnect = resolve;
    });
    const device = createMockDeviceClient({
      connect: vi.fn().mockImplementation(() => connectGate),
      on: vi.fn((event: string, fn: Function) => {
        listeners[event] = fn;
        return device;
      }),
    });
    const init = useDeviceStore.getState().initialize({ device, useMock: true });
    await vi.waitFor(() => expect(listeners.statusChange).toBeTypeOf('function'));
    useDeviceStore.setState({
      isConnected: true,
      lastStatusText: 'UNLOCKEDv2.1.0',
      version: 'v2.1.0',
      sessionEpoch: 3,
    });
    listeners.statusChange?.({
      isConnected: false,
      isLocked: true,
      isConfigMode: false,
      isBootloader: false,
      deviceType: DeviceType.UNKNOWN,
      deviceTypeSource: '',
      usbProductId: null,
      maxLabelSlot: 0,
      lastStatusText: '',
      version: '',
      devicePinSet: true,
      labels: new Map(),
    });
    expect(useDeviceStore.getState().isConnected).toBe(false);
    expect(useDeviceStore.getState().lastStatusText).toBe('');
    expect(useDeviceStore.getState().version).toBe('');
    expect(useDeviceStore.getState().sessionEpoch).toBe(4);
    releaseConnect();
    await init;
  });

  it('treats Device disconnected like Device not found on connect', async () => {
    const listPermittedDevices = vi.fn().mockResolvedValue([]);
    const device = createMockDeviceClient({
      connect: vi.fn().mockRejectedValue(new Error('Device disconnected')),
    });
    await useDeviceStore.getState().initialize({ device, listPermittedDevices });
    useDeviceStore.setState({ isConnected: true, sessionEpoch: 4, error: 'stale' });
    await useDeviceStore.getState().connect({ announce: false });
    expect(listPermittedDevices).toHaveBeenCalled();
    expect(useDeviceStore.getState().isConnected).toBe(false);
    expect(useDeviceStore.getState().error).toBeNull();
    expect(useDeviceStore.getState().sessionEpoch).toBe(5);
  });

  it('treats Not connected like Device not found on connect', async () => {
    const listPermittedDevices = vi.fn().mockResolvedValue([]);
    const device = createMockDeviceClient({
      connect: vi.fn().mockRejectedValue(new Error('Not connected')),
    });
    await useDeviceStore.getState().initialize({ device, listPermittedDevices });
    useDeviceStore.setState({ isConnected: true, sessionEpoch: 2, error: 'stale' });
    await useDeviceStore.getState().connect({ announce: false });
    expect(useDeviceStore.getState().isConnected).toBe(false);
    expect(useDeviceStore.getState().error).toBeNull();
    expect(useDeviceStore.getState().sessionEpoch).toBe(3);
  });

  it('resumes pending firmware after connect finishes, not from statusChange', async () => {
    const loadFirmwareBlocks = vi.fn().mockResolvedValue(undefined);
    const listeners: Record<string, Function> = {};
    const device = createMockDeviceClient({
      loadFirmwareBlocks,
      connect: vi.fn().mockResolvedValue(undefined),
      on: vi.fn((event: string, fn: Function) => {
        listeners[event] = fn;
        return device;
      }),
    });
    sessionStorage.setItem('ok-pending-firmware', JSON.stringify(['aa']));
    await useDeviceStore.getState().initialize({ device, useMock: true });
    useDeviceStore.setState({ isConnected: true });
    await listeners.statusChange?.({
      isConnected: true,
      isLocked: false,
      isConfigMode: false,
      isBootloader: true,
      deviceType: DeviceType.BOOTLOADER,
      deviceTypeSource: 'usb',
      usbProductId: 0xb001,
      maxLabelSlot: 0,
      lastStatusText: 'BOOTLOADER',
      version: '',
      devicePinSet: true,
      labels: new Map(),
    });
    expect(loadFirmwareBlocks).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('ok-pending-firmware')).toBe('["aa"]');

    useDeviceStore.setState({ isBootloader: true });
    await useDeviceStore.getState().connect({ announce: false });
    expect(loadFirmwareBlocks).toHaveBeenCalledWith(['aa']);
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

  it('does not start a second firmware load when two resumes overlap', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loadFirmwareBlocks = vi.fn().mockImplementation(() => gate);
    const device = createMockDeviceClient({ loadFirmwareBlocks });
    sessionStorage.setItem('ok-pending-firmware', JSON.stringify(['aa', 'bb']));
    await useDeviceStore.getState().initialize({ device, useMock: true });
    useDeviceStore.setState({ isBootloader: true });

    const first = useDeviceStore.getState().resumePendingFirmware();
    const second = useDeviceStore.getState().resumePendingFirmware();
    expect(loadFirmwareBlocks).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('ok-pending-firmware')).toBeNull();

    release();
    await Promise.all([first, second]);
    expect(loadFirmwareBlocks).toHaveBeenCalledTimes(1);
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
