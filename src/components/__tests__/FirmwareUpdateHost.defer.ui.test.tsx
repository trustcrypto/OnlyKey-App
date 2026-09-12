import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import FirmwareUpdateHost from '../FirmwareUpdateHost';
import { renderWithProviders } from '../../test/render';
import { seedDeviceStore } from '../../test/store';
import { FW_CHECK_SESSION_KEY } from '../../desktop/firmwareCheck';
import {
  confirmDownload,
  resetFirmwareUpdateStoreForTests,
  useFirmwareUpdateStore,
} from '../../store/useFirmwareUpdateStore';

const { checkFirmwareUpdate, downloadLatestFirmware, forceShowMainWindow } = vi.hoisted(() => ({
  checkFirmwareUpdate: vi.fn(),
  downloadLatestFirmware: vi.fn(),
  forceShowMainWindow: vi.fn(),
}));

vi.mock('../../desktop/firmwareCheck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../desktop/firmwareCheck')>();
  return {
    ...actual,
    checkFirmwareUpdate,
  };
});

vi.mock('../../desktop/firmwareDownload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../desktop/firmwareDownload')>();
  return {
    ...actual,
    downloadLatestFirmware,
  };
});

vi.mock('../../desktop/windowVisibility', () => ({
  forceShowMainWindow,
}));

const win = { id: 1, on: vi.fn(), removeListener: vi.fn() };

function abortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

function hangUntilAbort(io: { abortSignal?: AbortSignal } = {}): Promise<never> {
  return new Promise((_resolve, reject) => {
    const fail = () => reject(abortError());
    if (io.abortSignal?.aborted) {
      fail();
      return;
    }
    io.abortSignal?.addEventListener('abort', fail);
  });
}

describe('FirmwareUpdateHost defer-not-dismiss', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    checkFirmwareUpdate.mockReset();
    downloadLatestFirmware.mockReset();
    forceShowMainWindow.mockClear();
    win.on.mockClear();
    vi.stubGlobal('nw', { Window: { get: () => win } });
    resetFirmwareUpdateStoreForTests();
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isWorking: false,
      isBootloader: false,
      isInitialized: true,
      version: 'v2.1.2 STD',
      setupOccupiesFirmwarePrompt: false,
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    resetFirmwareUpdateStoreForTests();
  });

  it('keeps promptVisible across lock then unlock without a new GitHub GET', async () => {
    sessionStorage.setItem(FW_CHECK_SESSION_KEY, '1');
    useFirmwareUpdateStore.setState({
      phase: 'available',
      promptVisible: true,
      latestVersion: 'v3.0.4-prod',
      currentVersion: 'v2.1.2 STD',
      blocks: ['aa'],
    });
    renderWithProviders(<FirmwareUpdateHost />);
    expect(screen.getByTestId('firmware-update-dialog')).toBeInTheDocument();
    expect(checkFirmwareUpdate).not.toHaveBeenCalled();

    act(() => {
      seedDeviceStore({ isLocked: true });
    });
    expect(screen.queryByTestId('firmware-update-dialog')).not.toBeInTheDocument();
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'available',
      promptVisible: true,
      blocks: ['aa'],
    });

    act(() => {
      seedDeviceStore({ isLocked: false });
    });
    expect(screen.getByTestId('firmware-update-dialog')).toBeInTheDocument();
    expect(checkFirmwareUpdate).not.toHaveBeenCalled();
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'available',
      promptVisible: true,
      blocks: ['aa'],
    });
  });

  it('unplug during auto-check does not mark the session or show a dialog', async () => {
    checkFirmwareUpdate.mockImplementation(
      (_version: unknown, io: { abortSignal?: AbortSignal } = {}) => hangUntilAbort(io),
    );
    renderWithProviders(<FirmwareUpdateHost />);
    await vi.waitFor(() => expect(checkFirmwareUpdate).toHaveBeenCalled());
    expect(screen.queryByTestId('firmware-update-dialog')).not.toBeInTheDocument();

    act(() => {
      seedDeviceStore({ isConnected: false });
    });
    await vi.waitFor(() => {
      expect(useFirmwareUpdateStore.getState().phase).toBe('idle');
    });
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBeNull();
    expect(screen.queryByTestId('firmware-update-dialog')).not.toBeInTheDocument();
    expect(useFirmwareUpdateStore.getState().promptVisible).toBe(false);
  });

  it('unplug during download does not show an error modal', async () => {
    checkFirmwareUpdate.mockResolvedValue({
      kind: 'available',
      currentVersion: 'v2.1.2 STD',
      latestVersion: 'v3.0.4-prod',
      filename: 'Signed_OnlyKey_3_0_4_STD.txt',
    });
    downloadLatestFirmware.mockImplementation((io: { abortSignal?: AbortSignal } = {}) =>
      hangUntilAbort(io),
    );
    renderWithProviders(<FirmwareUpdateHost />);
    await vi.waitFor(() => {
      expect(useFirmwareUpdateStore.getState().phase).toBe('available');
    });
    expect(screen.getByTestId('firmware-update-dialog')).toBeInTheDocument();

    const pending = confirmDownload();
    await vi.waitFor(() => expect(downloadLatestFirmware).toHaveBeenCalled());

    act(() => {
      seedDeviceStore({ isConnected: false });
    });
    await pending;
    expect(screen.queryByTestId('firmware-update-dialog')).not.toBeInTheDocument();
    expect(useFirmwareUpdateStore.getState()).toMatchObject({
      phase: 'idle',
      promptVisible: false,
      error: null,
    });
  });
});
