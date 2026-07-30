import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDeviceStore } from '../useDeviceStore';
import { createMockDeviceClient, resetDeviceStoreForTests } from '../../test/store';

describe('useDeviceStore.connect announce flag', () => {
  beforeEach(async () => {
    await resetDeviceStoreForTests();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await resetDeviceStoreForTests();
    vi.useRealTimers();
  });

  it('silent connect (announce:false) never sets isConnecting during probe failure', async () => {
    const device = createMockDeviceClient({
      connect: vi.fn().mockRejectedValue(new Error('Device not found')),
    });
    useDeviceStore.setState({ device });

    const pending = useDeviceStore.getState().connect({ announce: false });
    // While in flight, silent probes must not flip the UI flag.
    expect(useDeviceStore.getState().isConnecting).toBe(false);
    await pending;
    expect(useDeviceStore.getState().isConnecting).toBe(false);
    expect(device.connect).toHaveBeenCalledTimes(1);
  });

  it('announced connect shows isConnecting until the attempt finishes', async () => {
    let resolveConnect!: () => void;
    const device = createMockDeviceClient({
      connect: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveConnect = resolve;
          }),
      ),
    });
    useDeviceStore.setState({ device });

    const pending = useDeviceStore.getState().connect({ announce: true });
    expect(useDeviceStore.getState().isConnecting).toBe(true);

    resolveConnect();
    await pending;
    expect(useDeviceStore.getState().isConnecting).toBe(false);
  });

  it('background poll uses silent connect and does not flash isConnecting', async () => {
    const device = createMockDeviceClient({
      connect: vi.fn().mockRejectedValue(new Error('Device not found')),
    });
    useDeviceStore.setState({ device, isConnected: false, isPolling: false });

    useDeviceStore.getState().startPolling();
    expect(useDeviceStore.getState().isPolling).toBe(true);

    // First poll fires after 2s.
    await vi.advanceTimersByTimeAsync(2000);
    // Flush the async connect handler.
    await Promise.resolve();
    await Promise.resolve();

    expect(device.connect).toHaveBeenCalled();
    expect(useDeviceStore.getState().isConnecting).toBe(false);
  });
});
