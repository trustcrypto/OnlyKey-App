import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECT_WATCHDOG_MS, useDeviceStore } from '../useDeviceStore';
import { createMockDeviceClient, resetDeviceStoreForTests } from '../../test/store';

describe('useDeviceStore hotplug connect mutex', () => {
  beforeEach(async () => {
    await resetDeviceStoreForTests();
  });

  afterEach(async () => {
    await resetDeviceStoreForTests();
    vi.useRealTimers();
  });

  it('queues a reconnect when connect() is called while another attempt is in flight', async () => {
    let release!: (err?: Error) => void;
    const hung = new Promise<void>((resolve, reject) => {
      release = (err) => (err ? reject(err) : resolve());
    });
    const connect = vi.fn().mockImplementationOnce(() => hung).mockResolvedValueOnce(undefined);
    const device = createMockDeviceClient({ connect });
    useDeviceStore.setState({ device, isConnected: false });

    const first = useDeviceStore.getState().connect({ announce: false });
    const overlapping = useDeviceStore.getState().connect({ announce: false });
    expect(connect).toHaveBeenCalledTimes(1);

    release(new Error('Device disconnected'));
    await first;
    await overlapping;
    await vi.waitFor(() => expect(connect).toHaveBeenCalledTimes(2));
    expect(useDeviceStore.getState().isConnecting).toBe(false);
  });

  it('watchdog starts a new connect and ignores the superseded failure', async () => {
    vi.useFakeTimers();
    let releaseFirst!: (err?: Error) => void;
    const firstHung = new Promise<void>((resolve, reject) => {
      releaseFirst = (err) => (err ? reject(err) : resolve());
    });
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const connect = vi
      .fn()
      .mockImplementationOnce(() => firstHung)
      .mockImplementationOnce(async () => {
        useDeviceStore.setState({ isConnected: true, lastStatusText: 'INITIALIZED' });
      });
    const device = createMockDeviceClient({ connect, disconnect });
    useDeviceStore.setState({ device, isConnected: false });

    const first = useDeviceStore.getState().connect({ announce: false });
    expect(connect).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(CONNECT_WATCHDOG_MS);
    expect(disconnect).toHaveBeenCalled();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(useDeviceStore.getState().isConnected).toBe(true);

    releaseFirst(new Error('Device disconnected'));
    await first;
    expect(useDeviceStore.getState().isConnected).toBe(true);
    expect(useDeviceStore.getState().lastStatusText).toBe('INITIALIZED');
  });
});
