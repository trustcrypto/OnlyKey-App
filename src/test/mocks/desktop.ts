import { vi } from 'vitest';

vi.mock('../../desktop/firmwareCheck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../desktop/firmwareCheck')>();
  return {
    ...actual,
    checkFirmwareUpdate: vi.fn(async () => ({
      kind: 'skipped' as const,
      reason: 'not-desktop' as const,
    })),
  };
});

vi.mock('../../utils/hidStatus', () => ({
  getHidStatus: vi.fn(() => ({
    available: true,
    hint: 'HID API ready — polling for your device.',
  })),
}));