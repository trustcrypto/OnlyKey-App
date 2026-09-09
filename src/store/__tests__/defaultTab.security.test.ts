import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getStoreState,
  resetDeviceStoreForTests,
  seedDeviceStore,
  stubDeviceInitialize,
  seedConnectedClassicLocked,
  seedConnectedClassicUnlocked,
} from '../../test/store';
import { DeviceType } from '../../api/device/types';
import { useDeviceStore } from '../useDeviceStore';

/**
 * Simulate the store statusChange path for lock→unlock without full HID.
 * Mirrors the branch that sets activeTab via defaultTabForDevice.
 */
function simulateUnlock(deviceType: DeviceType = DeviceType.CLASSIC, isInitialized = true) {
  const wasLocked = useDeviceStore.getState().isLocked;
  useDeviceStore.setState({
    isConnected: true,
    isLocked: false,
    isConfigMode: false,
    isBootloader: false,
    isInitialized,
    deviceType,
    error: null,
    pinError: null,
    ...(wasLocked
      ? {
          activeTab:
            !isInitialized || deviceType === DeviceType.UNINITIALIZED ? 'setup' : 'slots',
        }
      : {}),
  });
}

describe('default tab after unlock', () => {
  beforeEach(async () => {
    await resetDeviceStoreForTests();
    stubDeviceInitialize();
  });

  afterEach(async () => {
    await resetDeviceStoreForTests();
  });

  it('opens Slots when an initialized classic device unlocks', () => {
    seedConnectedClassicLocked();
    seedDeviceStore({ activeTab: 'setup', sessionEpoch: 1 });
    expect(getStoreState().isLocked).toBe(true);

    simulateUnlock(DeviceType.CLASSIC);

    expect(getStoreState().isLocked).toBe(false);
    expect(getStoreState().activeTab).toBe('slots');
  });

  it('opens Slots when an initialized DUO unlocks', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      deviceType: DeviceType.DUO,
      activeTab: 'setup',
    });

    simulateUnlock(DeviceType.DUO);
    expect(getStoreState().activeTab).toBe('slots');
  });

  it('keeps Setup for uninitialized devices after unlock', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      isInitialized: false,
      deviceType: DeviceType.DUO,
      activeTab: 'setup',
    });

    simulateUnlock(DeviceType.DUO, false);
    expect(getStoreState().activeTab).toBe('setup');
  });

  it('does not force Slots on every status tick while already unlocked', () => {
    seedConnectedClassicUnlocked();
    seedDeviceStore({ activeTab: 'backup', isLocked: false });

    // Already unlocked — another status update must not yank the user off Backup.
    simulateUnlock(DeviceType.CLASSIC);
    expect(getStoreState().activeTab).toBe('backup');
  });
});
