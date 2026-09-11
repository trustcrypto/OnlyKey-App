import { loadDesktopShell } from './appRoot';

type PreferenceKey = 'autoLaunch' | 'autoUpdate' | 'autoUpdateFW' | 'closeToTray';

const DEFAULTS: Record<PreferenceKey, boolean> = {
  autoLaunch: true,
  autoUpdate: true,
  autoUpdateFW: true,
  closeToTray: true,
};

export const AUTO_UPDATE_PREF_EVENT = 'onlykey-autoUpdate-changed';

export function notifyAutoUpdatePrefChanged(): void {
  try {
    window.dispatchEvent(new Event(AUTO_UPDATE_PREF_EVENT));
  } catch {
    /* ignore */
  }
  loadDesktopShell()?.refreshTrayMenu?.();
}

function getBoolean(value: string | boolean | null | undefined): boolean {
  if (typeof value === 'boolean') return value;
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
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        const value = getBoolean(stored);
        this.cache[key] = value;
        return value;
      }
      delete this.cache[key];
      return DEFAULTS[key];
    }
    if (this.cache[key] !== undefined) return this.cache[key]!;
    return DEFAULTS[key];
  }

  private set(key: PreferenceKey, value: boolean): void {
    this.cache[key] = getBoolean(value);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, getBooleanString(this.cache[key]!));
    }
    if (key === 'autoUpdate') notifyAutoUpdatePrefChanged();
  }
}

export const userPreferences = new UserPreferences();
