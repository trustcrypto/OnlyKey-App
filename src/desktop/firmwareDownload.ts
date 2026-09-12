import { sha256 } from 'js-sha256';
import { parseFirmwareData } from '../api/device/utils';
import { normalizeSha256 } from './updater';

export const FW_API_URL =
  'https://api.github.com/repos/trustcrypto/OnlyKey-Firmware/releases/latest';

const SHA256_HEX = /^[a-f0-9]{64}$/;
const GITHUB_DOWNLOAD_PREFIX = '/trustcrypto/OnlyKey-Firmware/releases/download/';
const GITHUB_REPO_PATH_PREFIX = '/trustcrypto/OnlyKey-Firmware/';
const GITHUB_API_REPO_PREFIX = '/repos/trustcrypto/OnlyKey-Firmware/';
const GITHUB_CDN_HOSTS = new Set([
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
]);

export type FirmwareUpdateErrorCode =
  | 'not-https'
  | 'host-not-allowed'
  | 'http-release'
  | 'http-firmware'
  | 'invalid-release'
  | 'missing-sha256'
  | 'sha256-mismatch'
  | 'invalid-firmware'
  | 'config-mode'
  | 'apply-failed'
  | 'io';

export class FirmwareUpdateError extends Error {
  constructor(
    message: string,
    readonly code: FirmwareUpdateErrorCode,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'FirmwareUpdateError';
  }
}

export interface FirmwareUpdateIo {
  fetchFn?: typeof fetch;
  sessionGet?: (key: string) => string | null;
  sessionSet?: (key: string, value: string) => void;
  isDesktop?: () => boolean;
  autoUpdateEnabled?: () => boolean;
  onProgress?: (received: number, total: number | null) => void;
  abortSignal?: AbortSignal;
}

export interface FirmwareDownloadResult {
  version: string;
  blocks: string[];
  downloadUrl: string;
  sha256: string;
}

export function buildFirmwareFilename(version: string): string {
  const parts = version.replace(/^v/, '').split('.');
  const major = parseInt(parts[0] || '0', 10);
  const minor = parseInt(parts[1] || '0', 10);
  const patch = parseInt(parts[2] || '0', 10);
  return `Signed_OnlyKey_${major}_${minor}_${patch}_STD.txt`;
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

export function isAllowedFirmwareUrl(url: string): boolean {
  if (!isHttpsUrl(url)) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (u.hostname === 'api.github.com') {
      return u.pathname.startsWith(GITHUB_API_REPO_PREFIX);
    }
    if (u.hostname === 'github.com') {
      return u.pathname.startsWith(GITHUB_REPO_PATH_PREFIX);
    }
    return GITHUB_CDN_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function isAllowedFirmwareRequestUrl(url: string): boolean {
  if (url === FW_API_URL) return true;
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      u.hostname === 'github.com' &&
      u.pathname.startsWith(GITHUB_DOWNLOAD_PREFIX)
    );
  } catch {
    return false;
  }
}

const REFUSED_LOCATION =
  'Firmware download refused: the location is not an allowed HTTPS GitHub path.';

export async function fetchFirmware(
  url: string,
  io: FirmwareUpdateIo = {},
): Promise<Response> {
  if (!isHttpsUrl(url)) {
    throw new FirmwareUpdateError(REFUSED_LOCATION, 'not-https');
  }
  if (!isAllowedFirmwareRequestUrl(url)) {
    throw new FirmwareUpdateError(REFUSED_LOCATION, 'host-not-allowed');
  }

  const fetchFn = io.fetchFn ?? fetch.bind(globalThis);
  const headers: Record<string, string> = {};
  if (url === FW_API_URL) {
    headers.Accept = 'application/vnd.github+json';
  }
  const res = await fetchFn(url, {
    cache: 'no-store',
    redirect: 'follow',
    headers,
    signal: io.abortSignal,
  });

  const finalUrl = res.url || url;
  if (!isHttpsUrl(finalUrl)) {
    throw new FirmwareUpdateError(REFUSED_LOCATION, 'not-https');
  }
  if (!isAllowedFirmwareUrl(finalUrl)) {
    throw new FirmwareUpdateError(REFUSED_LOCATION, 'host-not-allowed');
  }
  return res;
}

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  digest?: string | null;
}

interface GithubRelease {
  tag_name?: string;
  body?: string;
  assets?: GithubReleaseAsset[];
}

/** SHA-256 listed next to `filename` in a GitHub release body (pre-digest-API releases). */
export function parseFirmwareChecksumFromReleaseBody(
  body: string | undefined | null,
  filename: string,
): string | null {
  if (!body || !filename) return null;
  const lines = body.split(/\r?\n/).map((line) => line.trim());
  const hexLine = /^[a-fA-F0-9]{64}$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== filename && !line.startsWith(filename)) continue;

    const sameLine = line.match(/[a-fA-F0-9]{64}/);
    if (sameLine) return sameLine[0].toLowerCase();

    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      if (hexLine.test(lines[j])) return lines[j].toLowerCase();
      if (/\.txt$/i.test(lines[j]) && lines[j] !== filename) break;
    }
  }
  return null;
}

function expectedFirmwareSha256(
  asset: GithubReleaseAsset,
  body: string | undefined,
  filename: string,
): string {
  const fromDigest = asset.digest ? normalizeSha256(asset.digest) : '';
  if (SHA256_HEX.test(fromDigest)) return fromDigest;
  const fromBody = parseFirmwareChecksumFromReleaseBody(body, filename);
  if (fromBody && SHA256_HEX.test(fromBody)) return fromBody;
  throw new FirmwareUpdateError(
    'Firmware release is missing a SHA-256 digest.',
    'missing-sha256',
  );
}

function asFirmwareUpdateError(e: unknown, fallback: FirmwareUpdateErrorCode): FirmwareUpdateError {
  if (e instanceof FirmwareUpdateError) return e;
  const message = e instanceof Error ? e.message : 'Could not reach the firmware server.';
  return new FirmwareUpdateError(message, fallback);
}

export async function downloadLatestFirmware(
  io: FirmwareUpdateIo = {},
  _opts?: { latestVersion?: string },
): Promise<FirmwareDownloadResult> {
  void _opts;
  let apiRes: Response;
  try {
    apiRes = await fetchFirmware(FW_API_URL, io);
  } catch (e) {
    throw asFirmwareUpdateError(e, 'http-release');
  }
  if (!apiRes.ok) {
    throw new FirmwareUpdateError(
      `Firmware release lookup failed (${apiRes.status}).`,
      'http-release',
      apiRes.status,
    );
  }

  let release: GithubRelease;
  try {
    release = (await apiRes.json()) as GithubRelease;
  } catch {
    throw new FirmwareUpdateError(
      'Could not determine latest firmware version from GitHub.',
      'invalid-release',
    );
  }
  const tag = release.tag_name?.replace(/^v/, '');
  if (!tag) {
    throw new FirmwareUpdateError(
      'Could not determine latest firmware version from GitHub.',
      'invalid-release',
    );
  }
  const version = `v${tag}`;
  const filename = buildFirmwareFilename(version);
  const asset = release.assets?.find((a) => a.name === filename);
  if (!asset?.browser_download_url || !isHttpsUrl(asset.browser_download_url)) {
    throw new FirmwareUpdateError(
      `Firmware release is missing HTTPS asset ${filename}.`,
      !asset?.browser_download_url ? 'invalid-release' : 'not-https',
    );
  }
  const expected = expectedFirmwareSha256(asset, release.body, filename);

  let fwResponse: Response;
  try {
    fwResponse = await fetchFirmware(asset.browser_download_url, io);
  } catch (e) {
    throw asFirmwareUpdateError(e, 'http-firmware');
  }
  if (!fwResponse.ok) {
    throw new FirmwareUpdateError(
      `Firmware download failed (${fwResponse.status}).`,
      'http-firmware',
      fwResponse.status,
    );
  }

  const bytes = new Uint8Array(await fwResponse.arrayBuffer());
  const lengthHeader = Number(fwResponse.headers?.get?.('content-length'));
  const total =
    Number.isFinite(lengthHeader) && lengthHeader > 0 ? lengthHeader : bytes.byteLength;
  io.onProgress?.(bytes.byteLength, total);

  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new FirmwareUpdateError(
      'Firmware file SHA-256 does not match the GitHub release digest.',
      'sha256-mismatch',
    );
  }

  const text = new TextDecoder().decode(bytes);
  let blocks: string[];
  try {
    blocks = parseFirmwareData(text);
  } catch (e) {
    throw new FirmwareUpdateError(
      e instanceof Error ? e.message : 'The firmware file could not be parsed.',
      'invalid-firmware',
    );
  }
  if (!blocks.length) {
    throw new FirmwareUpdateError(
      'Downloaded firmware file could not be parsed.',
      'invalid-firmware',
    );
  }

  return { version, blocks, downloadUrl: asset.browser_download_url, sha256: actual };
}

export async function fetchLatestFirmwareRelease(): Promise<FirmwareDownloadResult> {
  return downloadLatestFirmware();
}
