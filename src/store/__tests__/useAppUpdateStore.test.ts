import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateError } from '../../desktop/updater';
import { userPreferences } from '../../desktop/userPreferences';

const checkAppUpdate = vi.fn();
const downloadAndVerify = vi.fn();
const showUpdateInFolder = vi.fn();

vi.mock('../../desktop/updater', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../desktop/updater')>();
  return {
    ...actual,
    checkAppUpdate: (...args: unknown[]) => checkAppUpdate(...args),
    downloadAndVerify: (...args: unknown[]) => downloadAndVerify(...args),
    showUpdateInFolder: (...args: unknown[]) => showUpdateInFolder(...args),
  };
});

import { AUTO_UPDATE_PREF_EVENT } from '../../desktop/userPreferences';
import {
  bindAutoUpdatePrefListeners,
  checkNow,
  confirmDownload,
  dismissUpdatePrompt,
  resetAppUpdateStoreForTests,
  setAutoCheck,
  showDownloadedUpdate,
  startAutoCheck,
  useAppUpdateStore,
} from '../useAppUpdateStore';

const available = {
  kind: 'available' as const,
  currentVersion: '5.7.0',
  latestVersion: '5.7.1',
  platformKey: 'win64' as const,
  remotePackage: {
    url: 'https://example.com/OnlyKey_5.7.1.exe',
    sha256: 'abc',
    size: 3,
  },
  manifestUrl: 'https://example.com/manifest.json',
};

describe('useAppUpdateStore', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    checkAppUpdate.mockReset();
    downloadAndVerify.mockReset();
    showUpdateInFolder.mockReset();
    userPreferences.autoUpdate = true;
    resetAppUpdateStoreForTests();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    resetAppUpdateStoreForTests();
  });

  it('skips auto-check when the pref is off', async () => {
    setAutoCheck(false);
    await startAutoCheck();
    expect(checkAppUpdate).not.toHaveBeenCalled();
    expect(useAppUpdateStore.getState().phase).toBe('idle');
  });

  it('starts an auto-check when the pref is turned on', async () => {
    checkAppUpdate.mockResolvedValue({
      kind: 'current',
      currentVersion: '5.7.0',
      latestVersion: '5.3.4',
    });
    setAutoCheck(false);
    expect(checkAppUpdate).not.toHaveBeenCalled();
    setAutoCheck(true);
    await vi.waitFor(() => expect(checkAppUpdate).toHaveBeenCalled());
    expect(checkAppUpdate.mock.calls[0][1]).toEqual({ force: false });
  });

  it('starts an auto-check when the tray pref event turns the flag on', async () => {
    checkAppUpdate.mockResolvedValue({
      kind: 'current',
      currentVersion: '5.7.0',
      latestVersion: '5.3.4',
    });
    setAutoCheck(false);
    const unbind = bindAutoUpdatePrefListeners();
    userPreferences.autoUpdate = true;
    window.dispatchEvent(new Event(AUTO_UPDATE_PREF_EVENT));
    await vi.waitFor(() => expect(checkAppUpdate).toHaveBeenCalled());
    unbind();
  });

  it('opens the available prompt on auto-check', async () => {
    checkAppUpdate.mockResolvedValue(available);
    await startAutoCheck();
    expect(useAppUpdateStore.getState()).toMatchObject({
      phase: 'available',
      promptVisible: true,
      latestVersion: '5.7.1',
    });
  });

  it('leaves auto current as idle without a prompt', async () => {
    checkAppUpdate.mockResolvedValue({
      kind: 'current',
      currentVersion: '5.7.0',
      latestVersion: '5.3.4',
    });
    await startAutoCheck();
    expect(useAppUpdateStore.getState()).toMatchObject({
      phase: 'idle',
      promptVisible: false,
    });
  });

  it('shows up-to-date only for a manual check', async () => {
    checkAppUpdate.mockResolvedValue({
      kind: 'current',
      currentVersion: '5.7.0',
      latestVersion: '5.7.0',
    });
    await checkNow();
    expect(useAppUpdateStore.getState()).toMatchObject({
      phase: 'up-to-date',
      promptVisible: true,
    });
  });

  it('auto transport errors stay in Tools without a modal', async () => {
    checkAppUpdate.mockRejectedValue(new AppUpdateError('Manifest fetch failed: HTTP 502', 'http-manifest', 502));
    await startAutoCheck();
    const state = useAppUpdateStore.getState();
    expect(state.phase).toBe('error');
    expect(state.promptVisible).toBe(false);
    expect(state.error).toMatch(/HTTP 502/);
  });

  it('auto missing-sha256 opens a security modal', async () => {
    checkAppUpdate.mockRejectedValue(new AppUpdateError('missing sha256', 'missing-sha256'));
    await startAutoCheck();
    expect(useAppUpdateStore.getState()).toMatchObject({
      phase: 'error',
      promptVisible: true,
      errorCode: 'missing-sha256',
    });
  });

  it('downloads after confirm and reaches ready', async () => {
    checkAppUpdate.mockResolvedValue(available);
    downloadAndVerify.mockResolvedValue({
      destPath: '/tmp/ok-updates/OnlyKey_5.7.1.exe',
      version: '5.7.1',
      sha256: 'abc',
      bytes: 3,
    });
    await startAutoCheck();
    await confirmDownload();
    expect(downloadAndVerify).toHaveBeenCalled();
    expect(useAppUpdateStore.getState()).toMatchObject({
      phase: 'ready',
      destPath: '/tmp/ok-updates/OnlyKey_5.7.1.exe',
      promptVisible: true,
    });
  });

  it('Later hides the prompt without downloading', async () => {
    checkAppUpdate.mockResolvedValue(available);
    await startAutoCheck();
    dismissUpdatePrompt();
    expect(useAppUpdateStore.getState().promptVisible).toBe(false);
    expect(downloadAndVerify).not.toHaveBeenCalled();
  });

  it('showDownloadedUpdate reveals the dest path', async () => {
    useAppUpdateStore.setState({ destPath: '/tmp/ok.exe' });
    showDownloadedUpdate();
    expect(showUpdateInFolder).toHaveBeenCalledWith('/tmp/ok.exe');
  });
});
