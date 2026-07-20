import { DeviceType } from '../api/device/types';
import type { DuoProfileId } from '../api/device/firmwareConstants';

/** Zustand fields cleared when no OnlyKey is connected — nothing device-specific may remain. */
export const disconnectedDeviceSnapshot = {
  isConnected: false,
  isLocked: true,
  isConfigMode: false,
  isBootloader: false,
  isRefreshingLabels: false,
  deviceType: DeviceType.UNKNOWN,
  deviceTypeSource: '',
  usbProductId: null,
  maxLabelSlot: 0,
  lastStatusText: '',
  version: '',
  devicePinSet: true,
  duoProfile: 'green' as DuoProfileId,
  labels: {} as Record<number, string>,
  error: null,
  pinError: null,
  recentMessages: [] as string[],
  firmwareCheck: null,
  fwUpdateSupport: false,
  selectedSlotId: null,
  isWorking: false,
};