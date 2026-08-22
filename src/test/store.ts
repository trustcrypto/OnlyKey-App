import { vi } from 'vitest';
import { resetDeviceStoreRuntimeForTests, useDeviceStore } from '../store/useDeviceStore';
import { disconnectedDeviceSnapshot } from '../store/deviceStateReset';
import type { DeviceStore } from '../store/useDeviceStore';
import { DeviceType } from '../api/device/types';
import type { DeviceClient } from '../api/device/DeviceClient';

type StoreSeed = Partial<
  Pick<
    DeviceStore,
    | 'isConnected'
    | 'isConnecting'
    | 'isLocked'
    | 'isConfigMode'
    | 'isBootloader'
    | 'isRefreshingLabels'
    | 'isPolling'
    | 'deviceType'
    | 'deviceTypeSource'
    | 'usbProductId'
    | 'maxLabelSlot'
    | 'lastStatusText'
    | 'version'
    | 'devicePinSet'
    | 'duoProfile'
    | 'isWorking'
    | 'workingMessage'
    | 'workingProgress'
    | 'fwUpdateSupport'
    | 'firmwareCheck'
    | 'labels'
    | 'error'
    | 'pinError'
    | 'recentMessages'
    | 'showUdevDialog'
    | 'activeTab'
    | 'selectedSlotId'
    | 'sessionEpoch'
    | 'device'
    | 'refreshLabels'
  >
>;

export async function resetDeviceStoreForTests(): Promise<void> {
  resetDeviceStoreRuntimeForTests();
  const { stopPolling, device } = useDeviceStore.getState();
  stopPolling();
  if (device && typeof device.disconnect === 'function') {
    await device.disconnect().catch(() => {});
  }
  useDeviceStore.setState({
    ...disconnectedDeviceSnapshot,
    isConnecting: false,
    isPolling: false,
    isWorking: false,
    workingMessage: 'Please wait…',
    workingProgress: null,
    showUdevDialog: false,
    device: null,
    activeTab: 'setup',
    sessionEpoch: 0,
  });
}

export function seedDeviceStore(patch: StoreSeed): void {
  useDeviceStore.setState(patch);
}

export function getStoreState() {
  return useDeviceStore.getState();
}

export function stubDeviceInitialize(): void {
  vi.spyOn(useDeviceStore.getState(), 'initialize').mockResolvedValue(undefined);
}

const mockResolved = () => vi.fn().mockResolvedValue(undefined);

/** Full DeviceClient stub — every method is a no-op mock for UI tests. */
export function createMockDeviceClient(overrides: Partial<DeviceClient> = {}): DeviceClient {
  return {
    connect: mockResolved(),
    disconnect: mockResolved(),
    getLabels: vi.fn().mockResolvedValue(new Map()),
    setSlot: mockResolved(),
    wipeSlot: mockResolved(),
    setSlotTypeSpeed: mockResolved(),
    setSlotFields: mockResolved(),
    setPin: mockResolved(),
    beginClassicPinEntry: mockResolved(),
    cancelClassicPinEntry: mockResolved(),
    refreshStatus: mockResolved(),
    setTime: mockResolved(),
    setPin2: mockResolved(),
    setSDPin: mockResolved(),
    sendPinDUO: mockResolved(),
    setBackupPassphrase: mockResolved(),
    setBackupKeyMode: mockResolved(),
    setYubiAuth: mockResolved(),
    wipeYubiAuth: mockResolved(),
    setPrivateKey: mockResolved(),
    wipePrivateKey: mockResolved(),
    restore: mockResolved(),
    firmwareUpdate: mockResolved(),
    triggerBootloader: mockResolved(),
    loadFirmwareBlocks: mockResolved(),
    setLockout: mockResolved(),
    setWipeMode: mockResolved(),
    setLedBrightness: mockResolved(),
    setKbdLayout: mockResolved(),
    setTypeSpeed: mockResolved(),
    setLockButton: mockResolved(),
    setDerivedChallengeMode: mockResolved(),
    setStoredChallengeMode: mockResolved(),
    setHmacChallengeMode: mockResolved(),
    setModKeyMode: mockResolved(),
    setSecProfileMode: mockResolved(),
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    ...overrides,
  } as unknown as DeviceClient;
}

const connectedClassicBase = {
  isConnected: true,
  isConfigMode: false,
  deviceType: DeviceType.CLASSIC,
  version: 'v2.1.0-prod',
  devicePinSet: true,
  device: createMockDeviceClient(),
  labels: { 1: 'Gmail', 2: 'GitHub' },
} as const;

/** Seed a connected Classic device (locked) without HID — for UI tests only. */
export function seedConnectedClassicLocked(): void {
  seedDeviceStore({ ...connectedClassicBase, isLocked: true });
}

/** Seed a connected Classic device (unlocked) — pages that require interaction. */
export function seedConnectedClassicUnlocked(): void {
  seedDeviceStore({ ...connectedClassicBase, isLocked: false });
}

/** Seed a connected DUO device (locked) with PIN form visible. */
export function seedConnectedDuoLocked(): void {
  seedDeviceStore({
    isConnected: true,
    isLocked: true,
    isConfigMode: false,
    deviceType: DeviceType.DUO,
    version: 'Dv3.0.0-prod',
    devicePinSet: true,
    device: createMockDeviceClient(),
    labels: { 1: 'Work' },
  });
}