import { create } from 'zustand';
import {
  AppUpdateError,
  type AppUpdateCheckResult,
  type AppUpdateErrorCode,
  applyAppUpdate,
  checkAppUpdate,
  downloadAndVerify,
  showUpdateInFolder,
} from '../desktop/updater';
import { AUTO_UPDATE_PREF_EVENT, userPreferences } from '../desktop/userPreferences';
import { useDeviceStore } from './useDeviceStore';

export type AppUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'applying'
  | 'up-to-date'
  | 'error';

export type AppUpdateUiCode = AppUpdateErrorCode | 'missing-platform';

export function appUpdateUserMessage(
  code: AppUpdateUiCode,
  httpStatus?: number,
  destPath?: string | null,
): string {
  switch (code) {
    case 'http-manifest':
    case 'http-package':
      return httpStatus != null
        ? `Could not reach the update server (HTTP ${httpStatus}).`
        : 'Could not reach the update server.';
    case 'invalid-manifest':
      return 'The update manifest was not valid JSON.';
    case 'io':
      return 'Could not read or write the update files.';
    case 'not-https':
    case 'host-not-allowed':
      return 'Update refused: the download location is not an allowed HTTPS path.';
    case 'missing-sha256':
      return 'The update manifest did not include a SHA-256 checksum. The download was not started.';
    case 'sha256-mismatch':
      return 'The downloaded installer failed integrity verification (SHA-256). The file was discarded.';
    case 'missing-platform':
      return 'No installer is published for this operating system yet.';
    case 'apply-failed':
      return destPath
        ? `Could not open the installer. It is still at ${destPath}.`
        : 'Could not open the installer.';
    default:
      return 'App update failed.';
  }
}

function autoErrorShowsModal(code: AppUpdateUiCode): boolean {
  return (
    code === 'missing-sha256' ||
    code === 'not-https' ||
    code === 'host-not-allowed' ||
    code === 'sha256-mismatch' ||
    code === 'http-package' ||
    code === 'apply-failed'
  );
}

export interface AppUpdateState {
  phase: AppUpdatePhase;
  autoCheck: boolean;
  promptVisible: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  error: string | null;
  errorCode: AppUpdateUiCode | null;
  destPath: string | null;
  expectedSha256: string | null;
  downloadReceived: number;
  downloadTotal: number | null;
  remotePackage: { url: string; sha256: string; size?: number } | null;
}

const initialState: AppUpdateState = {
  phase: 'idle',
  autoCheck: true,
  promptVisible: false,
  currentVersion: null,
  latestVersion: null,
  error: null,
  errorCode: null,
  destPath: null,
  expectedSha256: null,
  downloadReceived: 0,
  downloadTotal: null,
  remotePackage: null,
};

let inFlight: Promise<void> | null = null;
let abortController: AbortController | null = null;

function isBusy(): boolean {
  if (inFlight) return true;
  const phase = useAppUpdateStore.getState().phase;
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

export function abortAppUpdateFetches(): void {
  abortController?.abort();
  abortController = null;
}

export function hydrateAutoUpdate(): void {
  useAppUpdateStore.setState({ autoCheck: userPreferences.autoUpdate });
}

export function bindAutoUpdatePrefListeners(): () => void {
  hydrateAutoUpdate();
  const onChange = () => {
    const wasOn = useAppUpdateStore.getState().autoCheck;
    hydrateAutoUpdate();
    const nowOn = useAppUpdateStore.getState().autoCheck;
    if (nowOn && !wasOn) void startAutoCheck();
  };
  window.addEventListener('focus', onChange);
  window.addEventListener(AUTO_UPDATE_PREF_EVENT, onChange);
  return () => {
    window.removeEventListener('focus', onChange);
    window.removeEventListener(AUTO_UPDATE_PREF_EVENT, onChange);
  };
}

function presentAvailable(result: Extract<AppUpdateCheckResult, { kind: 'available' }>): void {
  useAppUpdateStore.setState({
    phase: 'available',
    promptVisible: true,
    currentVersion: result.currentVersion,
    latestVersion: result.latestVersion,
    remotePackage: result.remotePackage,
    error: null,
    errorCode: null,
  });
}

function presentError(
  code: AppUpdateUiCode,
  opts: { prompt: boolean; httpStatus?: number; destPath?: string | null },
): void {
  useAppUpdateStore.setState({
    phase: 'error',
    promptVisible: opts.prompt,
    errorCode: code,
    error: appUpdateUserMessage(code, opts.httpStatus, opts.destPath),
    destPath: opts.destPath ?? useAppUpdateStore.getState().destPath,
  });
}

async function runCheck(force: boolean): Promise<void> {
  useAppUpdateStore.setState({
    phase: 'checking',
    error: null,
    errorCode: null,
    promptVisible: false,
  });
  try {
    const result = await checkAppUpdate(
      { abortSignal: beginAbort(15_000) },
      { force },
    );
    if (result.kind === 'available') {
      presentAvailable(result);
      return;
    }
    if (result.kind === 'current') {
      if (!force) {
        console.info(
          `App update: ${result.currentVersion} is current (remote ${result.latestVersion})`,
        );
      }
      useAppUpdateStore.setState({
        phase: force ? 'up-to-date' : 'idle',
        promptVisible: force,
        currentVersion: result.currentVersion,
        latestVersion: result.latestVersion,
        remotePackage: null,
      });
      return;
    }
    if (result.kind === 'unavailable') {
      if (force) {
        presentError('missing-platform', { prompt: true });
      } else {
        console.error('App update: no installer for this platform');
        useAppUpdateStore.setState({
          phase: 'idle',
          promptVisible: false,
          errorCode: 'missing-platform',
          error: appUpdateUserMessage('missing-platform'),
        });
      }
      return;
    }
    if (result.kind === 'skipped') {
      console.info(`App update: auto-check skipped (${result.reason})`);
    }
    useAppUpdateStore.setState({ phase: 'idle', promptVisible: false });
  } catch (e) {
    const err = e instanceof AppUpdateError ? e : new AppUpdateError(String(e), 'io');
    const prompt = force || autoErrorShowsModal(err.code);
    if (!prompt) console.error('App update check failed:', err);
    presentError(err.code, { prompt, httpStatus: err.httpStatus });
  }
}

export async function startAutoCheck(): Promise<void> {
  hydrateAutoUpdate();
  if (!useAppUpdateStore.getState().autoCheck) {
    console.info('App update: auto-check skipped (pref-disabled)');
    return;
  }
  if (isBusy()) return;
  const run = runCheck(false).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

export async function checkNow(): Promise<void> {
  if (isBusy()) return;
  const run = runCheck(true).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

export async function confirmDownload(): Promise<void> {
  const state = useAppUpdateStore.getState();
  if (isBusy() || state.phase !== 'available' || !state.remotePackage || !state.latestVersion) return;
  const pkg = state.remotePackage;
  const version = state.latestVersion;
  const run = (async () => {
    useAppUpdateStore.setState({
      phase: 'downloading',
      promptVisible: true,
      downloadReceived: 0,
      downloadTotal: pkg.size ?? null,
    });
    try {
      const downloaded = await downloadAndVerify(version, pkg, {
        abortSignal: beginAbort(10 * 60 * 1000),
        onProgress: (received, total) => {
          useAppUpdateStore.setState({
            downloadReceived: received,
            downloadTotal: total,
          });
        },
      });
      useAppUpdateStore.setState({
        phase: 'ready',
        promptVisible: true,
        destPath: downloaded.destPath,
        expectedSha256: downloaded.sha256,
        downloadReceived: downloaded.bytes,
        downloadTotal: downloaded.bytes,
      });
    } catch (e) {
      const err = e instanceof AppUpdateError ? e : new AppUpdateError(String(e), 'io');
      presentError(err.code, { prompt: true, httpStatus: err.httpStatus });
    }
  })().finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

export function showDownloadedUpdate(): void {
  const destPath = useAppUpdateStore.getState().destPath;
  if (!destPath) return;
  showUpdateInFolder(destPath);
}

export async function applyUpdate(): Promise<void> {
  const state = useAppUpdateStore.getState();
  if (isBusy() || state.phase !== 'ready' || !state.destPath || !state.expectedSha256) return;
  if (useDeviceStore.getState().isWorking) return;
  const destPath = state.destPath;
  const sha256 = state.expectedSha256;
  const run = (async () => {
    useAppUpdateStore.setState({ phase: 'applying', promptVisible: true });
    try {
      await applyAppUpdate(destPath, { sha256 });
    } catch (e) {
      const err = e instanceof AppUpdateError ? e : new AppUpdateError(String(e), 'io');
      presentError(err.code, { prompt: true, destPath, httpStatus: err.httpStatus });
    }
  })().finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

export function dismissUpdatePrompt(): void {
  const { phase } = useAppUpdateStore.getState();
  if (phase === 'downloading' || phase === 'applying' || phase === 'checking') return;
  useAppUpdateStore.setState({ promptVisible: false });
}

export function setAutoCheck(value: boolean): void {
  const wasOn = useAppUpdateStore.getState().autoCheck;
  userPreferences.autoUpdate = value;
  hydrateAutoUpdate();
  if (value && !wasOn) void startAutoCheck();
}

export function resetAppUpdateStoreForTests(): void {
  abortController = null;
  inFlight = null;
  useAppUpdateStore.setState({ ...initialState, autoCheck: userPreferences.autoUpdate });
}

interface AppUpdateStore extends AppUpdateState {
  startAutoCheck: typeof startAutoCheck;
  checkNow: typeof checkNow;
  confirmDownload: typeof confirmDownload;
  showDownloadedUpdate: typeof showDownloadedUpdate;
  applyUpdate: typeof applyUpdate;
  dismissUpdatePrompt: typeof dismissUpdatePrompt;
  setAutoCheck: typeof setAutoCheck;
  hydrateAutoUpdate: typeof hydrateAutoUpdate;
}

export const useAppUpdateStore = create<AppUpdateStore>((set) => ({
  ...initialState,
  startAutoCheck,
  checkNow,
  confirmDownload,
  showDownloadedUpdate,
  applyUpdate,
  dismissUpdatePrompt,
  setAutoCheck,
  hydrateAutoUpdate: () => set({ autoCheck: userPreferences.autoUpdate }),
}));
