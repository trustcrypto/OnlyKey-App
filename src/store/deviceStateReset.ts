import { DeviceType } from '../api/device/types';
import type { DuoProfileId } from '../api/device/firmwareConstants';
import type { FirmwareCheckResult } from '../desktop/firmwareCheck';

/**
 * Zustand fields that MUST be wiped when the OnlyKey disconnects or the UI
 * session ends. Page-local React state is wiped separately by bumping
 * `sessionEpoch` and remounting keyed trees in App.tsx.
 *
 * Note: `activeTab` is NOT in this object — empty HID polls must not yank the
 * user off Tools while searching. Callers set `activeTab: 'setup'` only when
 * ending a real connected session.
 */
export const disconnectedDeviceSnapshot = {
  isConnected: false,
  isLocked: true,
  isConfigMode: false,
  isBootloader: false,
  isRefreshingLabels: false,
  deviceType: DeviceType.UNKNOWN,
  deviceTypeSource: '',
  usbProductId: null as number | null,
  maxLabelSlot: 0,
  lastStatusText: '',
  version: '',
  devicePinSet: true,
  duoProfile: 'green' as DuoProfileId,
  labels: {} as Record<number, string>,
  error: null as string | null,
  pinError: null as string | null,
  recentMessages: [] as string[],
  firmwareCheck: null as FirmwareCheckResult | null,
  fwUpdateSupport: false,
  selectedSlotId: null as number | null,
  isWorking: false,
  workingMessage: 'Please wait…',
  workingProgress: null as number | null,
};

/**
 * Extra fields wiped on unlocked→locked (connection may remain). Forces a
 * non-sensitive tab and clears secret-bearing store fields. Config-mode lock
 * keeps the current tab in useDeviceStore so Advanced key wipe stays reachable.
 */
export const lockedSessionWipeSnapshot = {
  isRefreshingLabels: false,
  labels: {} as Record<number, string>,
  error: null as string | null,
  pinError: null as string | null,
  recentMessages: [] as string[],
  firmwareCheck: null as FirmwareCheckResult | null,
  selectedSlotId: null as number | null,
  isWorking: false,
  workingMessage: 'Please wait…',
  workingProgress: null as number | null,
  activeTab: 'setup' as const,
};
