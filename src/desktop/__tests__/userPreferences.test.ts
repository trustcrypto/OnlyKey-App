import { beforeEach, describe, expect, it } from 'vitest';
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
  });
});
