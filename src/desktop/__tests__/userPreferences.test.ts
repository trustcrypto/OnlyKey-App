import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_UPDATE_FW_PREF_EVENT, userPreferences } from '../userPreferences';

describe('userPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults autoUpdate on like 5.6 when the key is absent', () => {
    expect(userPreferences.closeToTray).toBe(true);
    expect(userPreferences.autoLaunch).toBe(true);
    expect(userPreferences.autoUpdateFW).toBe(true);
    expect(userPreferences.autoUpdate).toBe(true);
  });

  it('honors a stored autoUpdate false', () => {
    localStorage.setItem('autoUpdate', 'false');
    expect(userPreferences.autoUpdate).toBe(false);
  });

  it('persists boolean flags to localStorage', () => {
    userPreferences.autoLaunch = false;
    expect(localStorage.getItem('autoLaunch')).toBe('false');
    expect(userPreferences.autoLaunch).toBe(false);

    userPreferences.autoUpdateFW = true;
    expect(localStorage.getItem('autoUpdateFW')).toBe('true');
    expect(userPreferences.autoUpdateFW).toBe(true);

    userPreferences.autoUpdate = true;
    expect(localStorage.getItem('autoUpdate')).toBe('true');
    expect(userPreferences.autoUpdate).toBe(true);

    userPreferences.closeToTray = false;
    expect(localStorage.getItem('closeToTray')).toBe('false');
    expect(userPreferences.closeToTray).toBe(false);
    userPreferences.closeToTray = true;
    expect(userPreferences.closeToTray).toBe(true);
  });

  it('dispatches onlykey-autoUpdateFW-changed when autoUpdateFW is set', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');
    userPreferences.autoUpdateFW = false;
    expect(
      spy.mock.calls.some(
        ([event]) => event instanceof Event && event.type === AUTO_UPDATE_FW_PREF_EVENT,
      ),
    ).toBe(true);
  });

  it('uses the in-memory cache when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    userPreferences.autoLaunch = false;
    expect(userPreferences.autoLaunch).toBe(false);
    userPreferences.autoLaunch = true;
    expect(userPreferences.autoLaunch).toBe(true);
    vi.unstubAllGlobals();
  });
});
