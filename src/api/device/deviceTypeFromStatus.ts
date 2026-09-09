import { DeviceType } from './types';

/**
 * Infer device type from firmware status text — matches OnlyKeyComm.setDeviceType().
 * Locked DUO uses INITIALIZED-D. Unlocked HW_MODEL(UNLOCKED) appends the version
 * suffix letter: c = Classic, p = DUO with PIN, n = DUO with no PIN. Classic can
 * run 3.x (`UNLOCKEDv3.0.4-prodc`); do not treat major version as the hardware.
 *
 * UNINITIALIZED* is first-use, not a hardware type. 5.6 still reads the trailing
 * letter (or INITIALIZED-D) so a wiped DUO gets DUO PIN setup, not Classic keypad.
 */
export function inferDeviceTypeFromStatusText(text: string): DeviceType | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  if (trimmed.includes('UNINITIALIZED')) return hardwareTypeFromUninitializedStatus(trimmed);
  if (trimmed.includes('BOOTLOADER')) return DeviceType.BOOTLOADER;
  if (trimmed.includes('INITIALIZED-D') || trimmed.includes('UNLOCKED-D')) return DeviceType.DUO;

  if (trimmed.includes('INITIALIZED') && !trimmed.includes('UNINITIALIZED')) {
    return DeviceType.CLASSIC;
  }

  const fromSuffix = hardwareTypeFromSuffix(trimmed);
  if (fromSuffix) return fromSuffix;

  // No c/p/n letter (tests and truncated HID). Major is a weak fallback only.
  const major = trimmed.match(/v(\d+)\./i)?.[1];
  if (major === '2') return DeviceType.CLASSIC;
  if (major === '3') return DeviceType.DUO;

  if (trimmed.includes('UNLOCKED')) return undefined;

  return undefined;
}

/** Same suffix-letter rule as setDeviceType; major version is fallback only. */
export function inferDeviceTypeFromVersion(version: string): DeviceType | undefined {
  const v = version.trim().toLowerCase();
  if (!v) return undefined;

  const fromSuffix = hardwareTypeFromSuffix(v);
  if (fromSuffix) return fromSuffix;
  if (/^v?3\./.test(v)) return DeviceType.DUO;
  if (/^v?2\./.test(v)) return DeviceType.CLASSIC;

  return undefined;
}

/** Last letter of HW_MODEL / version: c Classic, p DUO+PIN, n DUO no PIN. */
export function hardwareTypeFromSuffix(text: string): DeviceType | undefined {
  const lastChar = text.slice(-1).toLowerCase();
  if (lastChar === 'n' || lastChar === 'p') return DeviceType.DUO;
  if (lastChar === 'c') return DeviceType.CLASSIC;
  return undefined;
}

/**
 * 5.6 setDeviceType() on UNINITIALIZED*: n/p/c first, else INITIALIZED-D → DUO,
 * else CLASSIC (`"UNINITIALIZED".includes("INITIALIZED")`).
 */
export function hardwareTypeFromUninitializedStatus(text: string): DeviceType {
  const fromSuffix = hardwareTypeFromSuffix(text);
  if (fromSuffix) return fromSuffix;
  if (text.includes('INITIALIZED-D') || text.includes('UNLOCKED-D')) return DeviceType.DUO;
  return DeviceType.CLASSIC;
}

export function isUninitializedStatus(text: string): boolean {
  return text.includes('UNINITIALIZED');
}

/** First-use / wiped. Hardware type is still Classic or DUO. */
export function isUninitializedDevice(state: {
  isInitialized?: boolean;
  deviceType: DeviceType;
}): boolean {
  if (state.deviceType === DeviceType.UNINITIALIZED) return true;
  return state.isInitialized === false;
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