import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { renderWithProviders } from '../../test/render';
import {
  getStoreState,
  resetDeviceStoreForTests,
  seedDeviceStore,
  stubDeviceInitialize,
  seedConnectedClassicUnlocked,
} from '../../test/store';
import { DeviceType } from '../../api/device/types';
import { useDeviceStore } from '../useDeviceStore';
import { disconnectedDeviceSnapshot, lockedSessionWipeSnapshot } from '../deviceStateReset';

/** Mirrors the statusChange disconnect wipe branch. */
function wipeDisconnect() {
  useDeviceStore.setState({
    ...disconnectedDeviceSnapshot,
    isConnecting: false,
    activeTab: 'setup',
    sessionEpoch: useDeviceStore.getState().sessionEpoch + 1,
  });
}

/** Mirrors the unlocked→locked wipe branch. */
function wipeLock() {
  useDeviceStore.setState({
    ...lockedSessionWipeSnapshot,
    isConnected: true,
    isLocked: true,
    isConfigMode: false,
    deviceType: DeviceType.CLASSIC,
    labels: {},
    sessionEpoch: useDeviceStore.getState().sessionEpoch + 1,
  });
}

/**
 * CRITICAL security tests: no device session UI state may survive unplug or lock.
 */
describe('session wipe on disconnect / lock', () => {
  beforeEach(async () => {
    await resetDeviceStoreForTests();
  });

  afterEach(async () => {
    await resetDeviceStoreForTests();
  });

  it('bumps sessionEpoch and resets activeTab on simulated disconnect', () => {
    stubDeviceInitialize();
    seedConnectedClassicUnlocked();
    seedDeviceStore({
      activeTab: 'backup',
      labels: { 1: 'email' },
      recentMessages: ['UNLOCKEDv2'],
      selectedSlotId: 3,
      sessionEpoch: 4,
    });

    const before = getStoreState().sessionEpoch;
    wipeDisconnect();

    const s = getStoreState();
    expect(s.sessionEpoch).toBe(before + 1);
    expect(s.activeTab).toBe('setup');
    expect(s.labels).toEqual({});
    expect(s.recentMessages).toEqual([]);
    expect(s.selectedSlotId).toBeNull();
    expect(s.isConnected).toBe(false);
    expect(s.isLocked).toBe(true);
  });

  it('bumps sessionEpoch and wipes secrets on unlocked→locked', () => {
    stubDeviceInitialize();
    seedConnectedClassicUnlocked();
    seedDeviceStore({
      activeTab: 'backup',
      labels: { 1: 'secret-label' },
      recentMessages: ['slot data'],
      selectedSlotId: 1,
      sessionEpoch: 2,
    });

    wipeLock();

    const s = getStoreState();
    expect(s.sessionEpoch).toBe(3);
    expect(s.activeTab).toBe('setup');
    expect(s.labels).toEqual({});
    expect(s.recentMessages).toEqual([]);
    expect(s.selectedSlotId).toBeNull();
    expect(s.isConnected).toBe(true);
    expect(s.isLocked).toBe(true);
  });

  it('shows disconnected overlay and leaves Backup after disconnect', async () => {
    stubDeviceInitialize();
    seedConnectedClassicUnlocked();
    seedDeviceStore({ activeTab: 'backup', sessionEpoch: 0 });
    renderWithProviders(<App />);

    expect(screen.getByTestId('session-root')).toBeInTheDocument();
    expect(getStoreState().activeTab).toBe('backup');

    wipeDisconnect();

    expect(getStoreState().sessionEpoch).toBe(1);
    expect(getStoreState().activeTab).toBe('setup');
    expect(await screen.findByTestId('disconnected-overlay')).toBeInTheDocument();
  });

  it('does not keep Backup nav selection after disconnect', async () => {
    stubDeviceInitialize();
    seedConnectedClassicUnlocked();
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(screen.getByTestId('nav-backup'));
    expect(getStoreState().activeTab).toBe('backup');

    wipeDisconnect();

    expect(getStoreState().activeTab).toBe('setup');
  });
});
