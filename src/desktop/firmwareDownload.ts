import { sha256 } from 'js-sha256';
import { parseFirmwareData } from '../api/device/utils';
import { normalizeSha256 } from './updater';

const FW_API_URL = 'https://api.github.com/repos/trustcrypto/OnlyKey-Firmware/releases/latest';
const SHA256_HEX = /^[a-f0-9]{64}$/;

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
  throw new Error('Firmware release is missing a SHA-256 digest.');
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
  const expected = expectedFirmwareSha256(asset, release.body, filename);

  const fwResponse = await fetch(asset.browser_download_url);
  if (!fwResponse.ok) {
    throw new Error(`Firmware download failed (${fwResponse.status}).`);
  }

  const bytes = new Uint8Array(await fwResponse.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error('Firmware file SHA-256 does not match the GitHub release digest.');
  }

  const text = new TextDecoder().decode(bytes);
  const blocks = parseFirmwareData(text);
  if (!blocks.length) {
    throw new Error('Downloaded firmware file could not be parsed.');
  }

  return { version, blocks, downloadUrl: asset.browser_download_url, sha256: actual };
}
