import { userPreferences } from './userPreferences';

declare const nw: any;
declare const require: NodeRequire;

interface RemotePackage {
  url: string;
  size?: number;
}

interface RemoteManifest {
  version: string;
  packages?: Record<string, RemotePackage>;
}

function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

function platformPackageKey(): string | null {
  if (process.platform === 'win32') return 'win64';
  if (process.platform === 'darwin') return 'mac64';
  if (process.platform === 'linux') return 'linux64';
  return null;
}

function isHttpsUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check for app updates without nw-autoupdater (which pulls unfixed decompress).
 * Downloads the installer via HTTPS fetch and opens the containing folder —
 * same user-facing flow as the previous implementation (no auto-swap).
 */
export async function checkForAppUpdate(): Promise<void> {
  if (typeof nw === 'undefined' || !userPreferences.autoUpdate) return;

  try {
    const path = require('path') as typeof import('path');
    const fs = require('fs') as typeof import('fs');
    const os = require('os') as typeof import('os');
    const { pipeline } = require('stream/promises') as typeof import('stream/promises');
    const { createWriteStream } = fs;
    const { Readable } = require('stream') as typeof import('stream');

    const pkg = require(path.join(nw.App.startPath, 'package.json')) as {
      name?: string;
      version?: string;
      manifestUrl?: string;
    };

    const manifestUrl =
      pkg.manifestUrl ?? 'https://s3.amazonaws.com/onlykey-app/releases/latest/manifest.json';
    if (!isHttpsUrl(manifestUrl)) {
      console.error('App update: refusing non-HTTPS manifest URL');
      return;
    }

    const manifestRes = await fetch(manifestUrl, { cache: 'no-store' });
    if (!manifestRes.ok) {
      throw new Error(`Manifest fetch failed: HTTP ${manifestRes.status}`);
    }

    const rManifest = (await manifestRes.json()) as RemoteManifest;
    if (!rManifest?.version || !pkg.version) return;
    if (compareSemver(rManifest.version, pkg.version) <= 0) return;

    if (!confirm(`Version ${rManifest.version} is available. Download the update?`)) return;

    const key = platformPackageKey();
    const remotePkg = key ? rManifest.packages?.[key] : undefined;
    if (!remotePkg?.url || !isHttpsUrl(remotePkg.url)) {
      throw new Error('No HTTPS package URL for this platform in the remote manifest');
    }

    const downloadRes = await fetch(remotePkg.url, { cache: 'no-store' });
    if (!downloadRes.ok || !downloadRes.body) {
      throw new Error(`Update download failed: HTTP ${downloadRes.status}`);
    }

    const fileName = path.basename(new URL(remotePkg.url).pathname) || `OnlyKey_${rManifest.version}.bin`;
    const destDir = path.join(os.tmpdir(), 'onlykey-app-updates');
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, fileName);

    const nodeStream = Readable.fromWeb(downloadRes.body as import('stream/web').ReadableStream);
    await pipeline(nodeStream, createWriteStream(destPath));

    console.info(`Downloaded update to ${destPath}`);
    nw.Shell.showItemInFolder(destPath);
  } catch (e) {
    console.error('App update check failed:', e);
  }
}
