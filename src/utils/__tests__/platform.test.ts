import { afterEach, describe, expect, it, vi } from 'vitest';
import { isConnectErrorLikelyUdev, isLinux } from '../platform';

describe('platform', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects linux from process.platform', () => {
    vi.stubGlobal('process', { ...process, platform: 'linux' });
    expect(isLinux()).toBe(true);
  });

  it('detects non-linux from process.platform', () => {
    vi.stubGlobal('process', { ...process, platform: 'darwin' });
    expect(isLinux()).toBe(false);
  });

  it('classifies HID permission failures as udev-like', () => {
    expect(isConnectErrorLikelyUdev('Cannot open device')).toBe(true);
    expect(isConnectErrorLikelyUdev('Access denied')).toBe(true);
    expect(isConnectErrorLikelyUdev('Permission denied')).toBe(true);
    expect(isConnectErrorLikelyUdev('Failed to open hid')).toBe(true);
    expect(isConnectErrorLikelyUdev('Unable to connect')).toBe(true);
    expect(isConnectErrorLikelyUdev('device not found')).toBe(false);
  });
});
