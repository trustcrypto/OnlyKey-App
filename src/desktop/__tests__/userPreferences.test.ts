import { beforeEach, describe, expect, it } from 'vitest';
import { userPreferences } from '../userPreferences';

describe('userPreferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults unset keys to true', () => {
    expect(userPreferences.closeToTray).toBe(true);
    expect(userPreferences.autoUpdate).toBe(true);
  });

  it('persists boolean flags to localStorage', () => {
    userPreferences.autoLaunch = false;
    expect(localStorage.getItem('autoLaunch')).toBe('false');
    expect(userPreferences.autoLaunch).toBe(false);

    userPreferences.autoUpdateFW = true;
    expect(localStorage.getItem('autoUpdateFW')).toBe('true');
    expect(userPreferences.autoUpdateFW).toBe(true);
  });
});
