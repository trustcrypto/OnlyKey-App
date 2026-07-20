type PreferenceKey = 'autoLaunch' | 'autoUpdate' | 'autoUpdateFW' | 'closeToTray';

function getBoolean(value: string | null | undefined): boolean {
  return value !== 'false' && !!value;
}

function getBooleanString(value: boolean): string {
  return value ? 'true' : 'false';
}

class UserPreferences {
  private cache: Partial<Record<PreferenceKey, boolean>> = {};

  get autoLaunch(): boolean { return this.get('autoLaunch'); }
  set autoLaunch(value: boolean) { this.set('autoLaunch', value); }

  get autoUpdate(): boolean { return this.get('autoUpdate'); }
  set autoUpdate(value: boolean) { this.set('autoUpdate', value); }

  get autoUpdateFW(): boolean { return this.get('autoUpdateFW'); }
  set autoUpdateFW(value: boolean) { this.set('autoUpdateFW', value); }

  get closeToTray(): boolean { return this.get('closeToTray'); }
  set closeToTray(value: boolean) { this.set('closeToTray', value); }

  private get(key: PreferenceKey): boolean {
    if (this.cache[key] !== undefined) return this.cache[key]!;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(key) !== null) {
      return getBoolean(localStorage.getItem(key));
    }
    return true;
  }

  private set(key: PreferenceKey, value: boolean): void {
    this.cache[key] = getBoolean(value);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, getBooleanString(this.cache[key]!));
    }
  }
}

export const userPreferences = new UserPreferences();