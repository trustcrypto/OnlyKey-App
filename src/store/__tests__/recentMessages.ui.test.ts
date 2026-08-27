import { describe, it, expect } from 'vitest';
import { useDeviceStore } from '../useDeviceStore';
import { resetDeviceStoreForTests } from '../../test/store';
import { waitForConnected } from '../../test/helpers';

describe('recentMessages retention', () => {
  it('keeps at most fifty device messages via store listener', async () => {
    await resetDeviceStoreForTests();
    await useDeviceStore.getState().initialize(true);
    await waitForConnected();
    useDeviceStore.setState({ isLocked: false });

    const { device } = useDeviceStore.getState();
    expect(device).toBeTruthy();

    for (let i = 1; i <= 52; i++) {
      device!.emit('messageReceived', `Line ${i}`);
    }

    const { recentMessages } = useDeviceStore.getState();
    expect(recentMessages).toHaveLength(50);
    expect(recentMessages).toEqual([
      'Line 52', 'Line 51', 'Line 50', 'Line 49', 'Line 48',
      'Line 47', 'Line 46', 'Line 45', 'Line 44', 'Line 43',
      'Line 42', 'Line 41', 'Line 40', 'Line 39', 'Line 38',
      'Line 37', 'Line 36', 'Line 35', 'Line 34', 'Line 33',
      'Line 32', 'Line 31', 'Line 30', 'Line 29', 'Line 28',
      'Line 27', 'Line 26', 'Line 25', 'Line 24', 'Line 23',
      'Line 22', 'Line 21', 'Line 20', 'Line 19', 'Line 18',
      'Line 17', 'Line 16', 'Line 15', 'Line 14', 'Line 13',
      'Line 12', 'Line 11', 'Line 10', 'Line 9', 'Line 8',
      'Line 7', 'Line 6', 'Line 5', 'Line 4', 'Line 3',
    ]);
  });
});