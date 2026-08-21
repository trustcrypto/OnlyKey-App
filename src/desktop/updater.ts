import { sha256 } from 'js-sha256';
import { userPreferences } from './userPreferences';

declare const nw: any;
declare const require: NodeRequire;

export interface RemotePackage {
  url: string;
  size?: number;
  sha256?: string;
}

export interface RemoteManifest {
  version: string;
  packages?: Record<string, RemotePackage>;
}

export function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function isHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeSha256(value: string): string {
  return value.trim().toLowerCase().replace(/^sha256:/, '');
}

export function verifySha256(body: Uint8Array, expected: string): void {
  const actual = sha256(body);
  if (actual !== normalizeSha256(expected)) {
    throw new Error('Update package SHA-256 does not match the manifest.');
  }
}

function platformPackageKey(): string | null {
  if (process.platform === 'win32') return 'win64';
  if (process.platform === 'darwin') return 'mac64';
  if (process.platform === 'linux') return 'linux64';
  return null;
}

export interface AppUpdateIo {
  fetchFn?: typeof fetch;
  confirmFn?: (message: string) => boolean;
  readPackage?: () => { version?: string; manifestUrl?: string };
  writeFile?: (destPath: string, data: Uint8Array) => void;
  tmpDir?: () => string;
  showInFolder?: (destPath: string) => void;
}

/**
 * Check for app updates without nw-autoupdater (which pulls unfixed decompress).
 * Downloads the installer via HTTPS fetch, verifies sha256, and opens the folder.
 * Auto-update stays off until a 5.7 manifest with hashes exists.
 */
export async function checkForAppUpdate(io: AppUpdateIo = {}): Promise<void> {
  if (typeof nw === 'undefined' || !userPreferences.autoUpdate) return;

  const fetchFn = io.fetchFn ?? fetch.bind(globalThis);
  const confirmFn = io.confirmFn ?? ((message: string) => confirm(message));

  try {
    const path = require('path') as typeof import('path');
    const fs = require('fs') as typeof import('fs');
    const os = require('os') as typeof import('os');

    const pkg = io.readPackage?.() ?? (require(path.join(nw.App.startPath, 'package.json')) as {
      version?: string;
      manifestUrl?: string;
    });

    const manifestUrl =
      pkg.manifestUrl ?? 'https://s3.amazonaws.com/onlykey-app/releases/latest/manifest.json';
    if (!isHttpsUrl(manifestUrl)) {
      throw new Error('App update: refusing non-HTTPS manifest URL');
    }

    const manifestRes = await fetchFn(manifestUrl, { cache: 'no-store' });
    if (!manifestRes.ok) {
      throw new Error(`Manifest fetch failed: HTTP ${manifestRes.status}`);
    }

    const rManifest = (await manifestRes.json()) as RemoteManifest;
    if (!rManifest?.version || !pkg.version) return;
    if (compareSemver(rManifest.version, pkg.version) <= 0) return;

    if (!confirmFn(`Version ${rManifest.version} is available. Download the update?`)) return;

    const key = platformPackageKey();
    const remotePkg = key ? rManifest.packages?.[key] : undefined;
    if (!remotePkg?.url || !isHttpsUrl(remotePkg.url)) {
      throw new Error('No HTTPS package URL for this platform in the remote manifest');
    }
    if (!remotePkg.sha256) {
      throw new Error('Remote package is missing sha256');
    }

    const downloadRes = await fetchFn(remotePkg.url, { cache: 'no-store' });
    if (!downloadRes.ok) {
      throw new Error(`Update download failed: HTTP ${downloadRes.status}`);
    }

    const body = new Uint8Array(await downloadRes.arrayBuffer());
    if (remotePkg.size && body.byteLength !== remotePkg.size) {
      throw new Error('Update package size does not match the manifest.');
    }
    verifySha256(body, remotePkg.sha256);

    const fileName = path.basename(new URL(remotePkg.url).pathname) || `OnlyKey_${rManifest.version}.bin`;
    const destDir = io.tmpDir?.() ?? path.join(os.tmpdir(), 'onlykey-app-updates');
    const destPath = path.join(destDir, fileName);
    if (io.writeFile) {
      io.writeFile(destPath, body);
    } else {
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destPath, body);
    }

    console.info(`Downloaded update to ${destPath}`);
    (io.showInFolder ?? ((p: string) => nw.Shell.showItemInFolder(p)))(destPath);
  } catch (e) {
    console.error('App update check failed:', e);
    throw e;
  }
}
