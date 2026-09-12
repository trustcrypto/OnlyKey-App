import {
  FW_API_URL,
  type FirmwareUpdateIo,
  buildFirmwareFilename,
  fetchFirmware,
  isAbortError,
} from './firmwareDownload';
import { userPreferences } from './userPreferences';

export const FW_CHECK_SESSION_KEY = 'ok-fw-checked-session';
export { FW_API_URL, FirmwareUpdateError } from './firmwareDownload';
export type { FirmwareUpdateErrorCode, FirmwareUpdateIo } from './firmwareDownload';

export type FirmwareUpdateCheckResult =
  | { kind: 'skipped'; reason: 'not-desktop' | 'pref-disabled' | 'already-checked' | 'no-device' | 'unsafe-state' }
  | { kind: 'current'; currentVersion: string; latestVersion: string }
  | { kind: 'unsupported'; currentVersion: string; fwUpdateSupport: false }
  | {
      kind: 'available';
      currentVersion: string;
      latestVersion: string;
      filename: string;
    }
  | {
      kind: 'unavailable';
      code: 'http-release' | 'invalid-release' | 'missing-std-asset';
      currentVersion: string;
    };

export function firmwareVersionTuple(version: string): [number, number, number] {
  const v = version.trim().replace(/^v/i, '');
  const core = v.split(/[-+]/)[0] ?? v;
  const nums = core.split('.').map((p) => parseInt(p.replace(/[cnp]$/i, ''), 10) || 0);
  return [nums[0] || 0, nums[1] || 0, nums[2] || 0];
}

export function compareFirmwareVersion(a: string, b: string): number {
  const ta = firmwareVersionTuple(a);
  const tb = firmwareVersionTuple(b);
  for (let i = 0; i < 3; i++) {
    if (ta[i] !== tb[i]) return ta[i] > tb[i] ? 1 : -1;
  }
  return 0;
}

export function supportsAppFirmwareUpdate(version: string): boolean {
  if (!version || version.length < 10) return false;
  return version[9] !== '.' || parseInt(version[10] || '0', 10) > 6;
}

function sessionGet(io: FirmwareUpdateIo, key: string): string | null {
  if (io.sessionGet) return io.sessionGet(key);
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(io: FirmwareUpdateIo, key: string, value: string): void {
  if (io.sessionSet) {
    io.sessionSet(key, value);
    return;
  }
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function isDesktop(io: FirmwareUpdateIo): boolean {
  return (io.isDesktop ?? (() => typeof nw !== 'undefined'))();
}

function autoUpdateEnabled(io: FirmwareUpdateIo): boolean {
  return (io.autoUpdateEnabled ?? (() => userPreferences.autoUpdateFW))();
}

function markCheckedIfAuto(
  io: FirmwareUpdateIo,
  force: boolean,
  result: FirmwareUpdateCheckResult,
): FirmwareUpdateCheckResult {
  if (!force && result.kind !== 'skipped') {
    sessionSet(io, FW_CHECK_SESSION_KEY, '1');
  }
  return result;
}

interface GithubReleaseAsset {
  name?: string;
}

interface GithubRelease {
  tag_name?: unknown;
  assets?: GithubReleaseAsset[];
}

export async function checkFirmwareUpdate(
  currentVersion: string,
  io: FirmwareUpdateIo = {},
  opts?: { force?: boolean; isInitialized?: boolean; isBootloader?: boolean },
): Promise<FirmwareUpdateCheckResult> {
  const force = !!opts?.force;

  if (!isDesktop(io)) {
    console.info('Firmware update: auto-check skipped (not-desktop)');
    return { kind: 'skipped', reason: 'not-desktop' };
  }
  if (!force && !autoUpdateEnabled(io)) {
    console.info('Firmware update: auto-check skipped (pref-disabled)');
    return { kind: 'skipped', reason: 'pref-disabled' };
  }
  if (!force && sessionGet(io, FW_CHECK_SESSION_KEY)) {
    return { kind: 'skipped', reason: 'already-checked' };
  }
  if (opts?.isBootloader) {
    console.info('Firmware update: auto-check skipped (unsafe-state)');
    return { kind: 'skipped', reason: 'unsafe-state' };
  }

  const fwUpdateSupport = supportsAppFirmwareUpdate(currentVersion);
  if (!fwUpdateSupport && opts?.isInitialized !== false) {
    console.info('Firmware update: unsupported firmware for in-app update');
    return markCheckedIfAuto(io, force, {
      kind: 'unsupported',
      currentVersion,
      fwUpdateSupport: false,
    });
  }

  try {
    const res = await fetchFirmware(FW_API_URL, io);
    if (!res.ok) {
      console.error('Firmware update check failed:', res.status);
      return markCheckedIfAuto(io, force, {
        kind: 'unavailable',
        code: 'http-release',
        currentVersion,
      });
    }

    let release: GithubRelease;
    try {
      release = (await res.json()) as GithubRelease;
    } catch (e) {
      console.error('Firmware update check failed:', e);
      return markCheckedIfAuto(io, force, {
        kind: 'unavailable',
        code: 'invalid-release',
        currentVersion,
      });
    }

    const tagName = typeof release.tag_name === 'string' ? release.tag_name : '';
    if (!tagName) {
      console.error('Firmware update check failed: missing tag_name');
      return markCheckedIfAuto(io, force, {
        kind: 'unavailable',
        code: 'invalid-release',
        currentVersion,
      });
    }

    const latestVersion = tagName.startsWith('v') ? tagName : `v${tagName}`;
    const filename = buildFirmwareFilename(latestVersion);
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const hasStdAsset = assets.some((a) => a?.name === filename);

    if (compareFirmwareVersion(currentVersion, latestVersion) >= 0) {
      console.info(`Firmware update: ${currentVersion} is current (remote ${latestVersion})`);
      return markCheckedIfAuto(io, force, { kind: 'current', currentVersion, latestVersion });
    }

    if (!hasStdAsset) {
      console.error('Firmware update: missing-std-asset');
      return markCheckedIfAuto(io, force, {
        kind: 'unavailable',
        code: 'missing-std-asset',
        currentVersion,
      });
    }

    console.info(`Firmware update: ${latestVersion} available (have ${currentVersion})`);
    return markCheckedIfAuto(io, force, {
      kind: 'available',
      currentVersion,
      latestVersion,
      filename,
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    console.error('Firmware update check failed:', e);
    return markCheckedIfAuto(io, force, {
      kind: 'unavailable',
      code: 'http-release',
      currentVersion,
    });
  }
}

export const PENDING_FIRMWARE_KEY = 'ok-pending-firmware';

export function storePendingFirmware(blocks: string[]): void {
  sessionStorage.setItem(PENDING_FIRMWARE_KEY, JSON.stringify(blocks));
}

export function getPendingFirmware(): string[] | null {
  const raw = sessionStorage.getItem(PENDING_FIRMWARE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return null;
  }
}

export function clearPendingFirmware(): void {
  sessionStorage.removeItem(PENDING_FIRMWARE_KEY);
}
