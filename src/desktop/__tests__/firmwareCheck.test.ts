import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../firmwareCheck');

vi.mock('../userPreferences', () => ({
  userPreferences: { autoUpdateFW: true },
}));

import { userPreferences } from '../userPreferences';
import {
  checkForNewFirmware,
  clearPendingFirmware,
  getPendingFirmware,
  storePendingFirmware,
  supportsAppFirmwareUpdate,
} from '../firmwareCheck';

describe('firmwareCheck', () => {
  beforeEach(() => {
    sessionStorage.clear();
    userPreferences.autoUpdateFW = true;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in tests')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('detects firmware versions that support in-app updates', () => {
    expect(supportsAppFirmwareUpdate('')).toBe(false);
    expect(supportsAppFirmwareUpdate('v1')).toBe(false);
    expect(supportsAppFirmwareUpdate('123456789.5')).toBe(false);
    expect(supportsAppFirmwareUpdate('123456789.7')).toBe(true);
    expect(supportsAppFirmwareUpdate('123456789x0')).toBe(true);
  });

  it('stores and clears pending firmware blocks', () => {
    expect(getPendingFirmware()).toBeNull();
    storePendingFirmware(['aa', 'bb']);
    expect(getPendingFirmware()).toEqual(['aa', 'bb']);
    clearPendingFirmware();
    expect(getPendingFirmware()).toBeNull();
  });

  it('returns no update when auto-update is disabled', async () => {
    userPreferences.autoUpdateFW = false;
    const result = await checkForNewFirmware('v3.0.0-prod', 'classic');
    expect(result.updateAvailable).toBe(false);
    expect(result.fwUpdateSupport).toBe(true);
  });

  it('compares the current version to the GitHub latest tag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        url: 'https://github.com/trustcrypto/OnlyKey-Firmware/releases/tag/v3.0.4',
      })
    );

    const result = await checkForNewFirmware('v3.0.0-prod', 'classic');
    expect(result.updateAvailable).toBe(true);
    expect(result.latestVersion).toBe('v3.0.4');
    expect(sessionStorage.getItem('ok-fw-checked-session')).toBe('1');
  });

  it('skips GitHub when in-app updates are unsupported', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await checkForNewFirmware('v0.2-beta.6', 'classic');
    expect(result.updateAvailable).toBe(false);
    expect(result.fwUpdateSupport).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns no update when the latest URL has no tag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ url: 'https://github.com/trustcrypto/OnlyKey-Firmware/releases' }));
    const result = await checkForNewFirmware('v3.0.0-prod', 'classic');
    expect(result.updateAvailable).toBe(false);
  });

  it('returns null for corrupt pending firmware JSON', () => {
    sessionStorage.setItem('ok-pending-firmware', '{not-json');
    expect(getPendingFirmware()).toBeNull();
  });

  it('skips a second check in the same session', async () => {
    sessionStorage.setItem('ok-fw-checked-session', '1');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await checkForNewFirmware('v3.0.0-prod', 'classic');
    expect(result.updateAvailable).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
