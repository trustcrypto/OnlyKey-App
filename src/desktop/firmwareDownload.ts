import { parseFirmwareData } from '../api/device/utils';

const FW_RELEASES_URL = 'https://github.com/trustcrypto/OnlyKey-Firmware/releases/latest';

export interface FirmwareDownloadResult {
  version: string;
  blocks: string[];
  downloadUrl: string;
}

function buildFirmwareFilename(version: string): string {
  const parts = version.replace(/^v/, '').split('.');
  const major = parseInt(parts[0] || '0', 10);
  const minor = parseInt(parts[1] || '0', 10);
  const patch = parseInt(parts[2] || '0', 10);
  return `Signed_OnlyKey_${major}_${minor}_${patch}_STD.txt`;
}

export async function fetchLatestFirmwareRelease(): Promise<FirmwareDownloadResult> {
  const response = await fetch(FW_RELEASES_URL, { redirect: 'follow' });
  const latestUrl = response.url;
  const tagPart = latestUrl.split('/tag/v')[1];
  if (!tagPart) {
    throw new Error('Could not determine latest firmware version from GitHub.');
  }

  const version = `v${tagPart}`;
  const filename = buildFirmwareFilename(version);
  const downloadUrl = `https://github.com/trustcrypto/OnlyKey-Firmware/releases/download/${version}/${filename}`;

  const fwResponse = await fetch(downloadUrl);
  if (!fwResponse.ok) {
    throw new Error(`Firmware download failed (${fwResponse.status}).`);
  }

  const text = await fwResponse.text();
  const blocks = parseFirmwareData(text);
  if (!blocks.length) {
    throw new Error('Downloaded firmware file could not be parsed.');
  }

  return { version, blocks, downloadUrl };
}