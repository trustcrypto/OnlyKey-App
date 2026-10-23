import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../../App';
import { renderWithProviders } from '../../test/render';
import {
  getStoreState,
  resetDeviceStoreForTests,
  seedDeviceStore,
} from '../../test/store';
import { OnlyKeyDevice } from '../../api/device/OnlyKeyDevice';
import { DeviceType } from '../../api/device/types';
import { MockTransport } from '../../api/transport/MockTransport';
import { useDeviceStore } from '../useDeviceStore';

async function bootMockDevice(transport = new MockTransport({ startLocked: false })) {
  const device = new OnlyKeyDevice(transport);
  await useDeviceStore.getState().initialize({ device, useMock: true });
  await waitFor(() => expect(getStoreState().isConnected).toBe(true));
  return { device, transport };
}

/**
 * CRITICAL security tests: no device session UI state may survive unplug or lock.
 * Drive the real statusChange listeners — do not re-set Zustand snapshots.
 */
describe('session wipe on disconnect / lock', () => {
  beforeEach(async () => {
    await resetDeviceStoreForTests();
  });

  afterEach(async () => {
    await resetDeviceStoreForTests();
  });

  it('bumps sessionEpoch and resets activeTab on device disconnect', async () => {
    const { device } = await bootMockDevice();
    seedDeviceStore({
      activeTab: 'backup',
      labels: { 1: 'email' },
      recentMessages: ['UNLOCKEDv2'],
      selectedSlotId: 3,
      isLocked: false,
    });
    const before = getStoreState().sessionEpoch;

    await device.disconnect();

    await waitFor(() => {
      expect(getStoreState().sessionEpoch).toBe(before + 1);
    });
    const s = getStoreState();
    expect(s.activeTab).toBe('setup');
    expect(s.labels).toEqual({});
    expect(s.recentMessages).toEqual([]);
    expect(s.selectedSlotId).toBeNull();
    expect(s.isConnected).toBe(false);
    expect(s.isLocked).toBe(true);
  });

  it('stays on Setup after config-mode PIN reports UNLOCKED', async () => {
    const { transport } = await bootMockDevice();
    seedDeviceStore({
      activeTab: 'setup',
      isLocked: false,
    });
    (useDeviceStore.getState().device as OnlyKeyDevice)['lastUnlockedAt'] = 0;

    transport.simulateResponse('INITIALIZEDv2.1.0-prod');
    await waitFor(() => {
      expect(getStoreState().isLocked).toBe(true);
      expect(getStoreState().isConfigMode).toBe(true);
    });
    expect(getStoreState().activeTab).toBe('setup');

    transport.setLocked(false);
    transport.simulateResponse('UNLOCKEDv2.1.0-prod');
    await waitFor(() => expect(getStoreState().isLocked).toBe(false));
    expect(getStoreState().isConfigMode).toBe(true);
    expect(getStoreState().activeTab).toBe('setup');
  });

  it('bumps sessionEpoch and wipes secrets on unlocked→locked', async () => {
    const { transport } = await bootMockDevice();
    seedDeviceStore({
      activeTab: 'backup',
      labels: { 1: 'secret-label' },
      recentMessages: ['slot data'],
      selectedSlotId: 1,
      isLocked: false,
    });
    const before = getStoreState().sessionEpoch;

    (useDeviceStore.getState().device as OnlyKeyDevice)['lastUnlockedAt'] = 0;
    transport.setLocked(true);
    transport.simulateResponse('INITIALIZEDv2.1.0-prod');

    await waitFor(() => {
      expect(getStoreState().isLocked).toBe(true);
      expect(getStoreState().sessionEpoch).toBe(before + 1);
    });
    const s = getStoreState();
    expect(s.isConfigMode).toBe(true);
    expect(s.activeTab).toBe('backup');
    expect(s.labels).toEqual({});
    expect(s.recentMessages).toEqual([]);
    expect(s.selectedSlotId).toBeNull();
    expect(s.isConnected).toBe(true);
  });

  it('keeps Advanced selected through a config-mode lock', async () => {
    const { transport } = await bootMockDevice();
    seedDeviceStore({
      activeTab: 'advanced',
      isLocked: false,
    });
    (useDeviceStore.getState().device as OnlyKeyDevice)['lastUnlockedAt'] = 0;

    transport.simulateResponse('INITIALIZEDv2.1.0-prod');
    await waitFor(() => {
      expect(getStoreState().isLocked).toBe(true);
      expect(getStoreState().isConfigMode).toBe(true);
    });
    expect(getStoreState().activeTab).toBe('advanced');
  });

  it('stays on Advanced after a config-mode PIN reports UNLOCKED', async () => {
    const { transport } = await bootMockDevice();
    seedDeviceStore({
      activeTab: 'advanced',
      isLocked: false,
    });
    (useDeviceStore.getState().device as OnlyKeyDevice)['lastUnlockedAt'] = 0;

    transport.simulateResponse('INITIALIZEDv2.1.0-prod');
    await waitFor(() => {
      expect(getStoreState().isLocked).toBe(true);
      expect(getStoreState().isConfigMode).toBe(true);
    });
    expect(getStoreState().activeTab).toBe('advanced');

    transport.setLocked(false);
    transport.simulateResponse('UNLOCKEDv2.1.0-prod');
    await waitFor(() => expect(getStoreState().isLocked).toBe(false));
    expect(getStoreState().isConfigMode).toBe(true);
    expect(getStoreState().activeTab).toBe('advanced');
  });

  it('keeps Advanced selected through a DUO config-mode lock', async () => {
    const { transport } = await bootMockDevice(new MockTransport({ deviceType: 'duo', startLocked: false }));
    seedDeviceStore({
      activeTab: 'advanced',
      isLocked: false,
      deviceType: DeviceType.DUO,
    });
    (useDeviceStore.getState().device as OnlyKeyDevice)['lastUnlockedAt'] = 0;

    transport.simulateResponse('INITIALIZED-Dv3.0.0-prod');
    await waitFor(() => {
      expect(getStoreState().isLocked).toBe(true);
      expect(getStoreState().isConfigMode).toBe(true);
    });
    expect(getStoreState().activeTab).toBe('advanced');
  });

  it('stays on Advanced after a DUO config-mode PIN reports UNLOCKED', async () => {
    const { transport } = await bootMockDevice(new MockTransport({ deviceType: 'duo', startLocked: false }));
    seedDeviceStore({
      activeTab: 'advanced',
      isLocked: false,
      deviceType: DeviceType.DUO,
    });
    (useDeviceStore.getState().device as OnlyKeyDevice)['lastUnlockedAt'] = 0;

    transport.simulateResponse('INITIALIZED-Dv3.0.0-prod');
    await waitFor(() => {
      expect(getStoreState().isLocked).toBe(true);
      expect(getStoreState().isConfigMode).toBe(true);
    });
    expect(getStoreState().activeTab).toBe('advanced');

    transport.setLocked(false);
    transport.simulateResponse('UNLOCKEDv3.0.0-prod');
    await waitFor(() => expect(getStoreState().isLocked).toBe(false));
    expect(getStoreState().isConfigMode).toBe(true);
    expect(getStoreState().activeTab).toBe('advanced');
  });

  it.each([
    { name: 'classic', transport: () => new MockTransport({ startLocked: false }), lockText: 'LOCKED' },
    {
      name: 'duo',
      transport: () => new MockTransport({ deviceType: 'duo', startLocked: false }),
      lockText: 'LOCKED',
    },
  ])('forces Setup on $name idle lock that is not config mode', async ({ transport, lockText }) => {
    const { transport: t } = await bootMockDevice(transport());
    seedDeviceStore({
      activeTab: 'backup',
      isLocked: false,
    });
    (useDeviceStore.getState().device as OnlyKeyDevice)['lastUnlockedAt'] = 0;

    t.setLocked(true);
    t.simulateResponse(lockText);
    await waitFor(() => {
      expect(getStoreState().isLocked).toBe(true);
    });
    expect(getStoreState().isConfigMode).toBe(false);
    expect(getStoreState().activeTab).toBe('setup');
  });

  it('shows disconnected overlay and leaves Backup after disconnect', async () => {
    const { device } = await bootMockDevice();
    seedDeviceStore({ activeTab: 'backup', isLocked: false });
    renderWithProviders(<App />);

    expect(screen.getByTestId('session-root')).toBeInTheDocument();
    expect(getStoreState().activeTab).toBe('backup');

    await device.disconnect();

    await waitFor(() => {
      expect(getStoreState().activeTab).toBe('setup');
    });
    expect(await screen.findByTestId('disconnected-overlay')).toBeInTheDocument();
  });

  it('does not keep Backup nav selection after disconnect', async () => {
    await bootMockDevice();
    seedDeviceStore({ isLocked: false });
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(screen.getByTestId('nav-backup'));
    expect(getStoreState().activeTab).toBe('backup');

    await useDeviceStore.getState().device!.disconnect();

    await waitFor(() => {
      expect(getStoreState().activeTab).toBe('setup');
    });
  });
});
