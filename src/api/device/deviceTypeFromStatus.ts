import { DeviceType } from './types';

/**
 * Infer device type from firmware status text — matches legacy OnlyKeyComm.setDeviceType().
 * DUO locked messages use INITIALIZED-D; unlock often returns UNLOCKEDv… without -D.
 */
export function inferDeviceTypeFromStatusText(text: string): DeviceType | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes('UNINITIALIZED')) return DeviceType.UNINITIALIZED;
  if (trimmed.includes('BOOTLOADER')) return DeviceType.BOOTLOADER;
  if (trimmed.includes('INITIALIZED-D') || trimmed.includes('UNLOCKED-D')) return DeviceType.DUO;

  if (trimmed.includes('INITIALIZED') && !trimmed.includes('UNINITIALIZED')) {
    return DeviceType.CLASSIC;
  }

  // Major firmware version is authoritative before trailing suffix letters (v2=Classic, v3=DUO).
  const major = trimmed.match(/v(\d+)\./i)?.[1];
  if (major === '2') return DeviceType.CLASSIC;
  if (major === '3') return DeviceType.DUO;

  const lastChar = trimmed.slice(-1).toLowerCase();
  if (lastChar === 'n' || lastChar === 'p') return DeviceType.DUO;
  if (lastChar === 'c') return DeviceType.CLASSIC;

  /* Plain UNLOCKEDv… with no parseable major version — use inferDeviceTypeFromVersion(). */
  if (trimmed.includes('UNLOCKED')) return undefined;

  return undefined;
}

/** Firmware version suffix / major version — DUO is 3.x, Classic is 2.x (legacy OnlyKeyComm). */
export function inferDeviceTypeFromVersion(version: string): DeviceType | undefined {
  const v = version.trim().toLowerCase();
  if (!v) return undefined;

  const lastChar = v.slice(-1);
  if (lastChar === 'c') return DeviceType.CLASSIC;
  if (lastChar === 'n' || lastChar === 'p') return DeviceType.DUO;
  if (/^v?3\./.test(v)) return DeviceType.DUO;
  if (/^v?2\./.test(v)) return DeviceType.CLASSIC;

  return undefined;
}

export function maxLabelSlotId(slotIds: Iterable<number>): number {
  let max = 0;
  for (const id of slotIds) {
    max = Math.max(max, id);
  }
  return max;
}

/** DUO exposes slots 13–24; Classic stops at 12. */
export function inferDeviceTypeFromLabelSlotIds(slotIds: Iterable<number>): DeviceType | undefined {
  for (const id of slotIds) {
    if (id > 12) return DeviceType.DUO;
  }
  return undefined;
}

/**
 * Classic firmware streams 12 slot labels then stops. DUO may also idle at 12
 * when profiles 3–4 are empty — OnlyKeyDevice must not demote an existing DUO.
 */
export function classicConfirmedByLabels(
  slotIds: Iterable<number>,
  labelCount: number,
  endedByIdle: boolean,
): boolean {
  if (!endedByIdle || labelCount < 12) return false;
  return maxLabelSlotId(slotIds) <= 12;
}

/** True when firmware marks DUO as having no device PIN (version suffix 'n'). */
export function isDuoNoPinFromStatusText(text: string): boolean {
  return text.trim().slice(-1).toLowerCase() === 'n';
}