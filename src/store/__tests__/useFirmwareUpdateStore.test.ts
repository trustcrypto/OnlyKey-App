import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FirmwareUpdateError } from '../../desktop/firmwareDownload';
import { userPreferences, AUTO_UPDATE_FW_PREF_EVENT } from '../../desktop/userPreferences';
import { FW_CHECK_SESSION_KEY } from '../../desktop/firmwareCheck';

const checkFirmwareUpdate = vi.fn();
const downloadLatestFirmware = vi.fn();

vi.mock('../../desktop/firmwareCheck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../desktop/firmwareCheck')>();
  return {
    ...actual,
    checkFirmwareUpdate: (...args: unknown[]) => checkFirmwareUpdate(...args),
  };
});

vi.mock('../../desktop/firmwareDownload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../desktop/firmwareDownload')>();
  return {
    ...actual,
    downloadLatestFirmware: (...args: unknown[]) => downloadLatestFirmware(...args),
  };
});

import {
  bindAutoUpdateFWPrefListeners,
  checkNow,
  confirmDownload,
  dismiss,
  resetFirmwareUpdateStoreForTests,
  setAutoUpdateFW,
  startAutoCheck,
  useFirmwareUpdateStore,
} from '../useFirmwareUpdateStore';
import { seedDeviceStore } from '../../test/store';

const available = {
  kind: 'available' as const,
  currentVersion: 'v2.1.2 STD',
  latestVersion: 'v3.0.4-prod',
  filename: 'Signed_OnlyKey_3_0_4_STD.txt',
};

function seedSafeDevice(
  patch: Parameters<typeof seedDeviceStore>[0] = {},
): void {
  seedDeviceStore({
    isConnected: true,
    isLocked: false,
    isBootloader: false,
    isWorking: false,
    isInitialized: true,
    version: 'v2.1.2 STD',
    setupOccupiesFirmwarePrompt: false,
    ...patch,
  });
}

describe('useFirmwareUpdateStore', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    checkFirmwareUpdate.mockReset();
    downloadLatestFirmware.mockReset();
    downloadLatestFirmware.mockResolvedValue({
      version: 'v3.0.4-prod',
      blocks: ['aa'],
      downloadUrl: 'https://github.com/trustcrypto/OnlyKey-Firmware/releases/download/v3.0.4-prod/Signed_OnlyKey_3_0_4_STD.txt',
      sha256: 'abc',
    });
    vi.stubGlobal('nw', { Window: { get: () => ({ on: vi.fn() }) } });
    seedSafeDevice();
    userPreferences.autoUpdateFW = true;
    resetFirmwareUpdateStoreForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    resetFirmwareUpdateStoreForTests();
  });

  it('treats an absent autoUpdateFW key as on (S0)', async () => {
    localStorage.removeItem('autoUpdateFW');
    resetFirmwareUpdateStoreForTests();
    expect(userPreferences.autoUpdateFW).toBe(true);
    checkFirmwareUpdate.mockResolvedValue({
      kind: 'current',
      currentVersion: 'v2.1.2 STD',
      latestVersion: 'v2.1.2 STD',
    });
    await startAutoCheck();
    expect(checkFirmwareUpdate).toHaveBeenCalled();
    expect(checkFirmwareUpdate.mock.calls[0][2]).toMatchObject({ force: false });
  });

  it('skips auto-check when the stored pref is false (S1)', async () => {
    localStorage.setItem('autoUpdateFW', 'false');
    resetFirmwareUpdateStoreForTests();
    await startAutoCheck();
    expect(checkFirmwareUpdate).not.toHaveBeenCalled();
    expect(useFirmwareUpdateStore.getState().phase).toBe('idle');
  });

  it('skips auto-check while locked with no fetch and no session write (S2)', async () => {
    seedSafeDevice({ isLocked: true });
    await startAutoCheck();
    expect(checkFirmwareUpdate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBeNull();
    expect(useFirmwareUpdateStore.getState().phase).toBe('idle');
  });

  it('skips auto-check while Setup occupies the prompt (S2)', async () => {
    seedSafeDevice({
      isInitialized: false,
      version: '',
      setupOccupiesFirmwarePrompt: true,
    });
    await startAutoCheck();
    expect(checkFirmwareUpdate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBeNull();
  });

  it('starts an auto-check when the tray pref event turns the flag on (S2b)', async () => {
    checkFirmwareUpdate.mockResolvedValue({
      kind: 'current',
      currentVersion: 'v2.1.2 STD',
      latestVersion: 'v3.0.4-prod',
    });
    setAutoUpdateFW(false);
    expect(checkFirmwareUpdate).not.toHaveBeenCalled();
    const unbind = bindAutoUpdateFWPrefListeners();
    userPreferences.autoUpdateFW = true;
    window.dispatchEvent(new Event(AUTO_UPDATE_FW_PREF_EVENT));
    await vi.waitFor(() => expect(checkFirmwareUpdate).toHaveBeenCalled());
    unbind();
  });

  it('dismiss after available goes idle, marks the session, and does not download (S3)', async () => {
    checkFirmwareUpdate.mockResolvedValue(available);
    await startAutoCheck();
    expect(useFirmwareUpdateStore.getState().phase).toBe('available');
    dismiss();
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'idle',
      promptVisible: false,
    });
    expect(downloadLatestFirmware).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBe('1');
  });

  it('shows up-to-date only for a manual check (S4)', async () => {
    checkFirmwareUpdate.mockResolvedValue({
      kind: 'current',
      currentVersion: 'v3.0.4-prodc',
      latestVersion: 'v3.0.4-prod',
    });
    await checkNow();
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'up-to-date',
      promptVisible: true,
    });
  });

  it('auto GitHub down stays in Tools without a modal (S5)', async () => {
    checkFirmwareUpdate.mockResolvedValue({
      kind: 'unavailable',
      code: 'http-release',
      currentVersion: 'v2.1.2 STD',
    });
    await startAutoCheck();
    const state = useFirmwareUpdateStore.getState();
    expect(state.phase).toBe('error');
    expect(state.promptVisible).toBe(false);
    expect(state.error).toMatch(/firmware server/i);
  });

  it('auto missing-sha256 on download opens a security modal (S6)', async () => {
    checkFirmwareUpdate.mockResolvedValue(available);
    downloadLatestFirmware.mockRejectedValue(
      new FirmwareUpdateError(
        'Firmware release is missing a SHA-256 digest.',
        'missing-sha256',
      ),
    );
    await startAutoCheck();
    await confirmDownload();
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'error',
      promptVisible: true,
      errorCode: 'missing-sha256',
    });
  });

  it('setAutoUpdateFW(false) writes storage and notifies (S9)', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');
    setAutoUpdateFW(false);
    expect(localStorage.getItem('autoUpdateFW')).toBe('false');
    expect(useFirmwareUpdateStore.getState().autoCheckFW).toBe(false);
    expect(
      spy.mock.calls.some(
        ([event]) => event instanceof Event && event.type === AUTO_UPDATE_FW_PREF_EVENT,
      ),
    ).toBe(true);
  });

  it('ignores checkNow while downloading (S10)', async () => {
    useFirmwareUpdateStore.setState({ phase: 'downloading', promptVisible: true });
    await checkNow();
    expect(checkFirmwareUpdate).not.toHaveBeenCalled();
  });

  it('opens the available prompt on auto-check', async () => {
    checkFirmwareUpdate.mockResolvedValue(available);
    await startAutoCheck();
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'available',
      promptVisible: true,
      latestVersion: 'v3.0.4-prod',
      filename: 'Signed_OnlyKey_3_0_4_STD.txt',
    });
    expect(checkFirmwareUpdate.mock.calls[0][2]).toMatchObject({
      force: false,
      isInitialized: true,
    });
  });

  it('leaves auto current as idle without a prompt', async () => {
    checkFirmwareUpdate.mockResolvedValue({
      kind: 'current',
      currentVersion: 'v3.0.4-prodc',
      latestVersion: 'v3.0.4-prod',
    });
    await startAutoCheck();
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'idle',
      promptVisible: false,
    });
  });

  it('downloads after confirm and reaches ready without HID', async () => {
    checkFirmwareUpdate.mockResolvedValue(available);
    await startAutoCheck();
    await confirmDownload();
    expect(downloadLatestFirmware).toHaveBeenCalled();
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'ready',
      promptVisible: true,
      blocks: ['aa'],
      sha256: 'abc',
    });
  });

  it('passes isInitialized false for first-use empty version', async () => {
    seedSafeDevice({ isInitialized: false, version: '' });
    checkFirmwareUpdate.mockResolvedValue(available);
    await startAutoCheck();
    expect(checkFirmwareUpdate).toHaveBeenCalledWith(
      '',
      expect.anything(),
      expect.objectContaining({ force: false, isInitialized: false }),
    );
  });

  it('ignores a second auto-check while one is in flight', async () => {
    let resolveCheck: (value: unknown) => void = () => {};
    checkFirmwareUpdate.mockReturnValue(
      new Promise((resolve) => {
        resolveCheck = resolve;
      }),
    );
    const first = startAutoCheck();
    await vi.waitFor(() => expect(checkFirmwareUpdate).toHaveBeenCalledTimes(1));
    await startAutoCheck();
    expect(checkFirmwareUpdate).toHaveBeenCalledTimes(1);
    resolveCheck({
      kind: 'current',
      currentVersion: 'v2.1.2 STD',
      latestVersion: 'v3.0.4-prod',
    });
    await first;
  });
});
