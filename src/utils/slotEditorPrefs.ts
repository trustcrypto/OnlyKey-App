export type SlotConfigMode = 'basic' | 'advanced' | 'mfa';

const STORAGE_KEY = 'slotEditorConfigMode';

export function getLastSlotConfigMode(): SlotConfigMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'basic' || value === 'advanced' || value === 'mfa') return value;
  } catch {
    /* ignore */
  }
  return 'basic';
}

export function setLastSlotConfigMode(mode: SlotConfigMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}