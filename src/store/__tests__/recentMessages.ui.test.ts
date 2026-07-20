import { describe, it, expect } from 'vitest';
import { useDeviceStore } from '../useDeviceStore';
import { resetDeviceStoreForTests } from '../../test/store';
import { waitForConnected } from '../../test/helpers';

describe('recentMessages retention', () => {
  it('keeps at most five device messages via store listener', async () => {
    await resetDeviceStoreForTests();
    await useDeviceStore.getState().initialize(true);
    await waitForConnected();

    const { device } = useDeviceStore.getState();
    expect(device).toBeTruthy();

    for (let i = 1; i <= 7; i++) {
      device!.emit('messageReceived', `Line ${i}`);
    }

    const { recentMessages } = useDeviceStore.getState();
    expect(recentMessages).toHaveLength(5);
    expect(recentMessages).toEqual(['Line 7', 'Line 6', 'Line 5', 'Line 4', 'Line 3']);
  });
});