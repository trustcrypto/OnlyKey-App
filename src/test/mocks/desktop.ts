import { vi } from 'vitest';

vi.mock('../../desktop/firmwareCheck', () => ({
  checkForNewFirmware: vi.fn(async (currentVersion: string) => ({
    updateAvailable: false,
    currentVersion,
    fwUpdateSupport: false,
  })),
  getPendingFirmware: vi.fn(() => null),
  clearPendingFirmware: vi.fn(),
  supportsAppFirmwareUpdate: vi.fn(() => false),
  storePendingFirmware: vi.fn(),
  PENDING_FIRMWARE_KEY: 'ok-pending-firmware',
}));

vi.mock('../../utils/hidStatus', () => ({
  getHidStatus: vi.fn(() => ({
    available: true,
    hint: 'HID API ready — polling for your device.',
  })),
}));