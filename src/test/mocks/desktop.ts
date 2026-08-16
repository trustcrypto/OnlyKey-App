import { vi } from 'vitest';

vi.mock('../../desktop/firmwareCheck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../desktop/firmwareCheck')>();
  return {
    ...actual,
    checkForNewFirmware: vi.fn(async (currentVersion: string) => ({
      updateAvailable: false,
      currentVersion,
      fwUpdateSupport: false,
    })),
  };
});

vi.mock('../../utils/hidStatus', () => ({
  getHidStatus: vi.fn(() => ({
    available: true,
    hint: 'HID API ready — polling for your device.',
  })),
}));