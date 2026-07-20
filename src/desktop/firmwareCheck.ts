import { userPreferences } from './userPreferences';

const FW_CHECK_KEY = 'ok-fw-checked-session';
const FW_RELEASES_URL = 'https://github.com/trustcrypto/OnlyKey-Firmware/releases/latest';

export interface FirmwareCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  fwUpdateSupport: boolean;
  upgradeRequired?: boolean;
}

function parseVersionScore(version: string): number {
  const v = version.replace(/^v/, '');
  const parts = v.split(/[.-]/);
  const major = parseInt(parts[0] || '0', 10) * 100;
  const minor = parseInt(parts[1] || '0', 10) * 10;
  const patch = parseInt(parts[2] || '0', 10);
  return major + minor + patch;
}

export function supportsAppFirmwareUpdate(version: string): boolean {
  if (!version) return false;
  // Matches old logic: version[9] != '.' || version[10] > 6
  return version.length > 10 && (version[9] !== '.' || parseInt(version[10] || '0', 10) > 6);
}

export async function checkForNewFirmware(
  currentVersion: string,
  deviceType: string
): Promise<FirmwareCheckResult> {
  const fwUpdateSupport = supportsAppFirmwareUpdate(currentVersion);
  const upgradeRequired = deviceType === 'uninitialized';

  if (sessionStorage.getItem(FW_CHECK_KEY)) {
    return { updateAvailable: false, currentVersion, fwUpdateSupport, upgradeRequired };
  }

  if (!userPreferences.autoUpdateFW) {
    return { updateAvailable: false, currentVersion, fwUpdateSupport, upgradeRequired };
  }

  if (!fwUpdateSupport && !upgradeRequired) {
    return { updateAvailable: false, currentVersion, fwUpdateSupport, upgradeRequired };
  }

  try {
    const response = await fetch(FW_RELEASES_URL, { redirect: 'follow' });
    const latestUrl = response.url;
    const tagPart = latestUrl.split('/tag/v')[1];
    if (!tagPart) {
      return { updateAvailable: false, currentVersion, fwUpdateSupport };
    }

    const latestVersion = `v${tagPart}`;
    sessionStorage.setItem(FW_CHECK_KEY, '1');

    const updateAvailable = parseVersionScore(latestVersion) > parseVersionScore(currentVersion);
    return { updateAvailable, currentVersion, latestVersion, fwUpdateSupport };
  } catch (e) {
    console.error('Firmware check failed:', e);
    return { updateAvailable: false, currentVersion, fwUpdateSupport };
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