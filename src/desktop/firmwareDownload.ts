import { sha256 } from 'js-sha256';
import { parseFirmwareData } from '../api/device/utils';
import { normalizeSha256 } from './updater';

const FW_API_URL = 'https://api.github.com/repos/trustcrypto/OnlyKey-Firmware/releases/latest';

export interface FirmwareDownloadResult {
  version: string;
  blocks: string[];
  downloadUrl: string;
  sha256: string;
}

function buildFirmwareFilename(version: string): string {
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

interface GithubReleaseAsset {
  name: string;
  browser_download_url: string;
  digest?: string;
}

interface GithubRelease {
  tag_name?: string;
  assets?: GithubReleaseAsset[];
}

export async function fetchLatestFirmwareRelease(): Promise<FirmwareDownloadResult> {
  const apiRes = await fetch(FW_API_URL, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!apiRes.ok) {
    throw new Error(`Firmware release lookup failed (${apiRes.status}).`);
  }
  const release = (await apiRes.json()) as GithubRelease;
  const tag = release.tag_name?.replace(/^v/, '');
  if (!tag) {
    throw new Error('Could not determine latest firmware version from GitHub.');
  }
  const version = `v${tag}`;
  const filename = buildFirmwareFilename(version);
  const asset = release.assets?.find((a) => a.name === filename);
  if (!asset?.browser_download_url || !isHttpsUrl(asset.browser_download_url)) {
    throw new Error(`Firmware release is missing HTTPS asset ${filename}.`);
  }
  if (!asset.digest) {
    throw new Error('Firmware release is missing a SHA-256 digest.');
  }

  const fwResponse = await fetch(asset.browser_download_url);
  if (!fwResponse.ok) {
    throw new Error(`Firmware download failed (${fwResponse.status}).`);
  }

  const text = await fwResponse.text();
  const actual = sha256(text);
  if (actual !== normalizeSha256(asset.digest)) {
    throw new Error('Firmware file SHA-256 does not match the GitHub release digest.');
  }

  const blocks = parseFirmwareData(text);
  if (!blocks.length) {
    throw new Error('Downloaded firmware file could not be parsed.');
  }

  return { version, blocks, downloadUrl: asset.browser_download_url, sha256: actual };
}
