import { create } from 'zustand';
import {
  checkFirmwareUpdate,
  FW_CHECK_SESSION_KEY,
  type FirmwareUpdateCheckResult,
} from '../desktop/firmwareCheck';
import {
  downloadLatestFirmware,
  FirmwareUpdateError,
  type FirmwareUpdateErrorCode,
} from '../desktop/firmwareDownload';
import { AUTO_UPDATE_FW_PREF_EVENT, userPreferences } from '../desktop/userPreferences';
import { useDeviceStore } from './useDeviceStore';

export type FirmwareUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'applying'
  | 'up-to-date'
  | 'error';

export type FirmwareUpdateUiCode = FirmwareUpdateErrorCode | 'unsupported' | 'missing-std-asset';

export function firmwareUpdateUserMessage(code: FirmwareUpdateUiCode, httpStatus?: number): string {
  switch (code) {
    case 'http-release':
    case 'http-firmware':
      return httpStatus != null
        ? `Could not reach the firmware server (HTTP ${httpStatus}).`
        : 'Could not reach the firmware server.';
    case 'invalid-release':
      return 'The firmware release listing was not valid.';
    case 'not-https':
    case 'host-not-allowed':
      return 'Firmware download refused: the location is not an allowed HTTPS GitHub path.';
    case 'missing-sha256':
      return 'The firmware release did not include a SHA-256 checksum. The download was not started.';
    case 'sha256-mismatch':
      return 'The downloaded firmware failed integrity verification (SHA-256). It was not sent to OnlyKey.';
    case 'invalid-firmware':
      return 'The firmware file could not be parsed.';
    case 'config-mode':
      return 'OnlyKey is not in config mode.';
    case 'apply-failed':
      return 'Firmware load failed.';
    case 'unsupported':
      return 'This firmware cannot be updated from the app. Follow the loading instructions at docs.crp.to.';
    case 'missing-std-asset':
      return 'This firmware release does not include a standard (STD) image.';
    default:
      return 'Firmware update failed.';
  }
}

function autoDownloadErrorShowsModal(code: FirmwareUpdateUiCode): boolean {
  return (
    code === 'missing-sha256' ||
    code === 'not-https' ||
    code === 'host-not-allowed' ||
    code === 'sha256-mismatch' ||
    code === 'http-firmware' ||
    code === 'invalid-firmware'
  );
}

export interface FirmwareUpdateState {
  phase: FirmwareUpdatePhase;
  autoCheckFW: boolean;
  promptVisible: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  filename: string | null;
  blocks: string[] | null;
  sha256: string | null;
  error: string | null;
  errorCode: FirmwareUpdateUiCode | null;
  downloadReceived: number;
  downloadTotal: number | null;
}

const initialState: FirmwareUpdateState = {
  phase: 'idle',
  autoCheckFW: true,
  promptVisible: false,
  currentVersion: null,
  latestVersion: null,
  filename: null,
  blocks: null,
  sha256: null,
  error: null,
  errorCode: null,
  downloadReceived: 0,
  downloadTotal: null,
};

let inFlight: Promise<void> | null = null;
let abortController: AbortController | null = null;

function isBusy(): boolean {
  if (inFlight) return true;
  const phase = useFirmwareUpdateStore.getState().phase;
  return phase === 'checking' || phase === 'downloading' || phase === 'applying';
}

function beginAbort(timeoutMs: number): AbortSignal {
  abortController?.abort();
  abortController = new AbortController();
  const ac = abortController;
  window.setTimeout(() => {
    if (abortController === ac) ac.abort();
  }, timeoutMs);
  return ac.signal;
}

export function abortFirmwareUpdateFetches(): void {
  abortController?.abort();
  abortController = null;
}

function markSessionChecked(): void {
  try {
    sessionStorage.setItem(FW_CHECK_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Device + desktop gates that must hold before an auto or manual GitHub GET. */
export function isSafeFirmwareCheckMoment(): boolean {
  if (typeof nw === 'undefined') return false;
  const d = useDeviceStore.getState();
  if (!d.isConnected) return false;
  if (d.isLocked) return false;
  if (d.isBootloader) return false;
  if (d.isWorking) return false;
  if (d.setupOccupiesFirmwarePrompt) return false;
  if (d.version) return true;
  return !d.isInitialized;
}

export function hydrateAutoUpdateFW(): void {
  useFirmwareUpdateStore.setState({ autoCheckFW: userPreferences.autoUpdateFW });
}

export function bindAutoUpdateFWPrefListeners(): () => void {
  hydrateAutoUpdateFW();
  const onChange = () => {
    const wasOn = useFirmwareUpdateStore.getState().autoCheckFW;
    hydrateAutoUpdateFW();
    const nowOn = useFirmwareUpdateStore.getState().autoCheckFW;
    if (nowOn && !wasOn) void startAutoCheck();
  };
  window.addEventListener('focus', onChange);
  window.addEventListener(AUTO_UPDATE_FW_PREF_EVENT, onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    window.removeEventListener(AUTO_UPDATE_FW_PREF_EVENT, onChange);
  };
}

function presentAvailable(result: Extract<FirmwareUpdateCheckResult, { kind: 'available' }>): void {
  useFirmwareUpdateStore.setState({
    phase: 'available',
    promptVisible: true,
    currentVersion: result.currentVersion,
    latestVersion: result.latestVersion,
    filename: result.filename,
    error: null,
    errorCode: null,
  });
}

function presentError(
  code: FirmwareUpdateUiCode,
  opts: { prompt: boolean; httpStatus?: number },
): void {
  useFirmwareUpdateStore.setState({
    phase: 'error',
    promptVisible: opts.prompt,
    errorCode: code,
    error: firmwareUpdateUserMessage(code, opts.httpStatus),
  });
}

async function runCheck(force: boolean): Promise<void> {
  const { version, isInitialized, isBootloader } = useDeviceStore.getState();
  useFirmwareUpdateStore.setState({
    phase: 'checking',
    error: null,
    errorCode: null,
    promptVisible: false,
  });
  try {
    const result = await checkFirmwareUpdate(
      version,
      { abortSignal: beginAbort(15_000) },
      { force, isInitialized, isBootloader },
    );
    if (result.kind === 'available') {
      presentAvailable(result);
      return;
    }
    if (result.kind === 'current') {
      useFirmwareUpdateStore.setState({
        phase: force ? 'up-to-date' : 'idle',
        promptVisible: force,
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        filename: null,
      });
      return;
    }
    if (result.kind === 'unsupported') {
      if (force) {
        presentError('unsupported', { prompt: true });
      } else {
        useFirmwareUpdateStore.setState({
          phase: 'idle',
          promptVisible: false,
          currentVersion: result.currentVersion,
          errorCode: 'unsupported',
          error: firmwareUpdateUserMessage('unsupported'),
        });
      }
      return;
    }
    if (result.kind === 'unavailable') {
      presentError(result.code, { prompt: force });
      if (!force) console.error('Firmware update check failed:', result.code);
      return;
    }
    if (result.kind === 'skipped') {
      console.info(`Firmware update: auto-check skipped (${result.reason})`);
    }
    useFirmwareUpdateStore.setState({ phase: 'idle', promptVisible: false });
  } catch (e) {
    const err = e instanceof FirmwareUpdateError ? e : new FirmwareUpdateError(String(e), 'io');
    const prompt = force || autoDownloadErrorShowsModal(err.code);
    if (!prompt) console.error('Firmware update check failed:', err);
    presentError(err.code, { prompt, httpStatus: err.httpStatus });
  }
}

export async function startAutoCheck(): Promise<void> {
  hydrateAutoUpdateFW();
  if (!useFirmwareUpdateStore.getState().autoCheckFW) {
    console.info('Firmware update: auto-check skipped (pref-disabled)');
    return;
  }
  if (isBusy()) return;
  if (!isSafeFirmwareCheckMoment()) {
    console.info('Firmware update: auto-check skipped (unsafe-state)');
    return;
  }
  const run = runCheck(false).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

export async function checkNow(): Promise<void> {
  if (isBusy()) return;
  if (!isSafeFirmwareCheckMoment()) return;
  const run = runCheck(true).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

export async function confirmDownload(): Promise<void> {
  const state = useFirmwareUpdateStore.getState();
  if (isBusy() || state.phase !== 'available' || !state.latestVersion) return;
  const version = state.latestVersion;
  const run = (async () => {
    useFirmwareUpdateStore.setState({
      phase: 'downloading',
      promptVisible: true,
      downloadReceived: 0,
      downloadTotal: null,
    });
    try {
      const downloaded = await downloadLatestFirmware(
        {
          abortSignal: beginAbort(60_000),
          onProgress: (received, total) => {
            useFirmwareUpdateStore.setState({
              downloadReceived: received,
              downloadTotal: total,
            });
          },
        },
        { latestVersion: version },
      );
      const filename = useFirmwareUpdateStore.getState().filename;
      console.info(
        `Firmware update: downloaded ${filename ?? 'firmware'} (sha256 ok)`,
      );
      useFirmwareUpdateStore.setState({
        phase: 'ready',
        promptVisible: true,
        latestVersion: downloaded.version,
        blocks: downloaded.blocks,
        sha256: downloaded.sha256,
        downloadReceived: downloaded.blocks.length,
        downloadTotal: downloaded.blocks.length,
      });
    } catch (e) {
      const err = e instanceof FirmwareUpdateError ? e : new FirmwareUpdateError(String(e), 'io');
      presentError(err.code, { prompt: true, httpStatus: err.httpStatus });
    }
  })().finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

export function openFirmwareTab(): void {
  const { phase } = useFirmwareUpdateStore.getState();
  if (phase === 'downloading' || phase === 'checking' || phase === 'applying') return;
  useDeviceStore.getState().setActiveTab('firmware');
  markSessionChecked();
  useFirmwareUpdateStore.setState({ promptVisible: false });
}

export function dismiss(): void {
  const { phase } = useFirmwareUpdateStore.getState();
  if (phase === 'downloading' || phase === 'checking' || phase === 'applying') return;
  markSessionChecked();
  useFirmwareUpdateStore.setState({
    phase: 'idle',
    promptVisible: false,
  });
}

/** Unplug: drop RAM blocks. Lock does not call this. */
export function resetOnDisconnect(): void {
  abortFirmwareUpdateFetches();
  inFlight = null;
  useFirmwareUpdateStore.setState({
    ...initialState,
    autoCheckFW: userPreferences.autoUpdateFW,
  });
}

export function setAutoUpdateFW(value: boolean): void {
  const wasOn = useFirmwareUpdateStore.getState().autoCheckFW;
  userPreferences.autoUpdateFW = value;
  hydrateAutoUpdateFW();
  if (value && !wasOn) void startAutoCheck();
}

export function resetFirmwareUpdateStoreForTests(): void {
  abortController = null;
  inFlight = null;
  useFirmwareUpdateStore.setState({
    ...initialState,
    autoCheckFW: userPreferences.autoUpdateFW,
  });
}

interface FirmwareUpdateStore extends FirmwareUpdateState {
  startAutoCheck: typeof startAutoCheck;
  checkNow: typeof checkNow;
  confirmDownload: typeof confirmDownload;
  openFirmwareTab: typeof openFirmwareTab;
  dismiss: typeof dismiss;
  resetOnDisconnect: typeof resetOnDisconnect;
  setAutoUpdateFW: typeof setAutoUpdateFW;
  hydrateAutoUpdateFW: typeof hydrateAutoUpdateFW;
}

export const useFirmwareUpdateStore = create<FirmwareUpdateStore>((set) => ({
  ...initialState,
  startAutoCheck,
  checkNow,
  confirmDownload,
  openFirmwareTab,
  dismiss,
  resetOnDisconnect,
  setAutoUpdateFW,
  hydrateAutoUpdateFW: () => set({ autoCheckFW: userPreferences.autoUpdateFW }),
}));
