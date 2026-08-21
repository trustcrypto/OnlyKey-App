import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userPreferences } from '../userPreferences';

describe('userPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults autoUpdate off and other flags on', () => {
    expect(userPreferences.closeToTray).toBe(true);
    expect(userPreferences.autoLaunch).toBe(true);
    expect(userPreferences.autoUpdateFW).toBe(true);
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

  it('uses the in-memory cache when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    userPreferences.autoLaunch = false;
    expect(userPreferences.autoLaunch).toBe(false);
    userPreferences.autoLaunch = true;
    expect(userPreferences.autoLaunch).toBe(true);
    vi.unstubAllGlobals();
  });
});
