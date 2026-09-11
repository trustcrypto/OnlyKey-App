import { sha256 } from 'js-sha256';
import { resolveAppRoot } from './appRoot';
import { userPreferences } from './userPreferences';

declare const nw: any;
declare const require: NodeRequire;

export const DEFAULT_MANIFEST_URL =
  'https://s3.amazonaws.com/onlykey-app/releases/latest/manifest.json';

export const APP_UPDATE_SESSION_KEY = 'ok-app-update-checked-session';

export interface RemotePackage {
  url: string;
  size?: number;
  sha256?: string;
}

export interface RemoteManifest {
  version: string;
  packages?: Record<string, RemotePackage>;
}

export type PlatformPackageKey = 'win64' | 'mac64' | 'linux64';

export type AppUpdateErrorCode =
  | 'not-https'
  | 'host-not-allowed'
  | 'http-manifest'
  | 'http-package'
  | 'invalid-manifest'
  | 'missing-sha256'
  | 'sha256-mismatch'
  | 'io'
  | 'apply-failed';

export class AppUpdateError extends Error {
  constructor(
    message: string,
    readonly code: AppUpdateErrorCode,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'AppUpdateError';
  }
}

export type AppUpdateCheckResult =
  | { kind: 'skipped'; reason: 'not-desktop' | 'pref-disabled' | 'already-checked' }
  | { kind: 'current'; currentVersion: string; latestVersion: string }
  | {
      kind: 'available';
      currentVersion: string;
      latestVersion: string;
      platformKey: PlatformPackageKey;
      remotePackage: { url: string; sha256: string; size?: number };
      manifestUrl: string;
    }
  | {
      kind: 'unavailable';
      code: 'missing-platform';
      currentVersion: string;
      latestVersion: string;
    };

export interface AppUpdateDownloadResult {
  destPath: string;
  version: string;
  sha256: string;
  bytes: number;
}

export type LocalAppPackage = {
  version: string;
  manifestUrl: string;
  updateBaseUrl?: string;
};

export interface AppUpdateIo {
  fetchFn?: typeof fetch;
  readPackage?: () => {
    version?: string;
    version_name?: string;
    manifestUrl?: string;
    updateBaseUrl?: string;
  };
  /** Test seam; production uses `resolveAppRoot()` from `appRoot.ts`. */
  resolveAppRoot?: () => string;
  writeFile?: (destPath: string, data: Uint8Array) => void;
  readFile?: (destPath: string) => Uint8Array;
  unlink?: (destPath: string) => void;
  tmpDir?: () => string;
  showInFolder?: (destPath: string) => void;
  spawnInstaller?: (destPath: string, platform: NodeJS.Platform) => Promise<void>;
  quitApp?: () => void;
  platform?: () => NodeJS.Platform;
  sessionGet?: (key: string) => string | null;
  sessionSet?: (key: string, value: string) => void;
  isDesktop?: () => boolean;
  autoUpdateEnabled?: () => boolean;
  onProgress?: (received: number, total: number | null) => void;
  applyDelayMs?: number;
  abortSignal?: AbortSignal;
}

export function compareSemver(a: string, b: string): number {
  const parse = (v: string): { core: number[]; pre: string | null } => {
    const stripped = v.replace(/^v/i, '');
    const noBuild = stripped.split('+')[0] ?? stripped;
    const dash = noBuild.indexOf('-');
    const coreStr = dash >= 0 ? noBuild.slice(0, dash) : noBuild;
    const pre = dash >= 0 ? noBuild.slice(dash + 1) : null;
    const core = coreStr.split('.').map((x) => parseInt(x, 10) || 0);
    return { core, pre };
  };
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.core.length, pb.core.length);
  for (let i = 0; i < len; i++) {
    const d = (pa.core[i] || 0) - (pb.core[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  if (pa.pre && !pb.pre) return -1;
  if (!pa.pre && pb.pre) return 1;
  if (pa.pre && pb.pre && pa.pre !== pb.pre) return pa.pre < pb.pre ? -1 : 1;
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

/** Directory of the manifest, always with a trailing slash. */
export function updateUrlPrefix(manifestUrl: string, baseUrl?: string): string {
  const raw = baseUrl && baseUrl.length > 0 ? baseUrl : manifestUrl.replace(/\/[^/]*$/, '/');
  return raw.endsWith('/') ? raw : `${raw}/`;
}

export function isAllowedUpdateUrl(
  url: string,
  manifestUrl: string,
  baseUrl?: string,
): boolean {
  if (!isHttpsUrl(url) || !isHttpsUrl(manifestUrl)) return false;
  if (baseUrl && !isHttpsUrl(baseUrl)) return false;
  try {
    const u = new URL(url);
    const prefix = new URL(updateUrlPrefix(manifestUrl, baseUrl));
    if (u.protocol !== 'https:' || prefix.protocol !== 'https:') return false;
    if (u.hostname !== prefix.hostname) return false;
    if (u.port !== prefix.port) return false;
    const prefixPath = prefix.pathname.endsWith('/') ? prefix.pathname : `${prefix.pathname}/`;
    return u.pathname.startsWith(prefixPath);
  } catch {
    return false;
  }
}

export function platformPackageKey(
  platform: NodeJS.Platform = process.platform,
): PlatformPackageKey | null {
  if (platform === 'win32') return 'win64';
  if (platform === 'darwin') return 'mac64';
  if (platform === 'linux') return 'linux64';
  return null;
}

function isUsableAppRoot(dir: string | undefined | null): dir is string {
  if (!dir) return false;
  const path = require('path') as typeof import('path');
  const root = path.parse(dir).root;
  return dir !== root && dir !== '/';
}

function readNwAppManifest(): {
  version?: string;
  version_name?: string;
  manifestUrl?: string;
  updateBaseUrl?: string;
} | null {
  try {
    if (typeof nw === 'undefined') return null;
    return nw.App?.manifest ?? null;
  } catch {
    return null;
  }
}

function readDiskPackageJson(io?: AppUpdateIo): {
  version?: string;
  version_name?: string;
  manifestUrl?: string;
  updateBaseUrl?: string;
} | null {
  try {
    const path = require('path') as typeof import('path');
    const fs = require('fs') as typeof import('fs');
    const root = io?.resolveAppRoot?.() ?? resolveAppRoot();
    if (!isUsableAppRoot(root)) return null;
    const pkgPath = path.join(root, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const raw = fs.readFileSync(pkgPath, 'utf8');
    return JSON.parse(raw) as {
      version?: string;
      version_name?: string;
      manifestUrl?: string;
      updateBaseUrl?: string;
    };
  } catch {
    return null;
  }
}

export function readLocalAppPackage(io?: AppUpdateIo): LocalAppPackage {
  if (io?.readPackage) {
    const pkg = io.readPackage();
    return {
      version: String(pkg.version ?? pkg.version_name ?? ''),
      manifestUrl: pkg.manifestUrl ?? DEFAULT_MANIFEST_URL,
      updateBaseUrl: pkg.updateBaseUrl,
    };
  }
  const nwMan = readNwAppManifest();
  const disk = readDiskPackageJson(io);
  return {
    version: String(
      nwMan?.version ?? nwMan?.version_name ?? disk?.version ?? disk?.version_name ?? '',
    ),
    manifestUrl: nwMan?.manifestUrl ?? disk?.manifestUrl ?? DEFAULT_MANIFEST_URL,
    updateBaseUrl: nwMan?.updateBaseUrl ?? disk?.updateBaseUrl,
  };
}

function sessionGet(io: AppUpdateIo, key: string): string | null {
  if (io.sessionGet) return io.sessionGet(key);
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionSet(io: AppUpdateIo, key: string, value: string): void {
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

function isDesktop(io: AppUpdateIo): boolean {
  return (io.isDesktop ?? (() => typeof nw !== 'undefined'))();
}

function autoUpdateEnabled(io: AppUpdateIo): boolean {
  return (io.autoUpdateEnabled ?? (() => userPreferences.autoUpdate))();
}

function fetchInit(io: AppUpdateIo): RequestInit {
  return { cache: 'no-store', redirect: 'error', signal: io.abortSignal };
}

function asAppUpdateError(e: unknown, fallbackCode: AppUpdateErrorCode): AppUpdateError {
  if (e instanceof AppUpdateError) return e;
  const message = e instanceof Error ? e.message : 'Could not read or write the update files.';
  return new AppUpdateError(message, fallbackCode);
}

export async function checkAppUpdate(
  io: AppUpdateIo = {},
  opts?: { force?: boolean },
): Promise<AppUpdateCheckResult> {
  if (!isDesktop(io)) return { kind: 'skipped', reason: 'not-desktop' };

  const force = !!opts?.force;
  if (!force && !autoUpdateEnabled(io)) return { kind: 'skipped', reason: 'pref-disabled' };
  if (!force && sessionGet(io, APP_UPDATE_SESSION_KEY)) {
    return { kind: 'skipped', reason: 'already-checked' };
  }

  const pkg = readLocalAppPackage(io);
  if (!pkg.version) {
    throw new AppUpdateError('Could not read or write the update files.', 'io');
  }
  if (!isHttpsUrl(pkg.manifestUrl)) {
    throw new AppUpdateError('App update: refusing non-HTTPS manifest URL', 'not-https');
  }

  const fetchFn = io.fetchFn ?? fetch.bind(globalThis);
  let manifestRes: Response;
  try {
    manifestRes = await fetchFn(pkg.manifestUrl, fetchInit(io));
  } catch (e) {
    throw asAppUpdateError(e, 'io');
  }
  if (!manifestRes.ok) {
    throw new AppUpdateError(
      `Manifest fetch failed: HTTP ${manifestRes.status}`,
      'http-manifest',
      manifestRes.status,
    );
  }

  let rManifest: RemoteManifest;
  try {
    rManifest = (await manifestRes.json()) as RemoteManifest;
  } catch {
    throw new AppUpdateError('The update manifest was not valid JSON.', 'invalid-manifest');
  }
  if (!rManifest?.version || typeof rManifest.version !== 'string') {
    throw new AppUpdateError('The update manifest was not valid JSON.', 'invalid-manifest');
  }

  if (!force) sessionSet(io, APP_UPDATE_SESSION_KEY, '1');

  if (compareSemver(rManifest.version, pkg.version) <= 0) {
    return { kind: 'current', currentVersion: pkg.version, latestVersion: rManifest.version };
  }

  const key = platformPackageKey(io.platform?.() ?? process.platform);
  const remotePkg = key ? rManifest.packages?.[key] : undefined;
  if (!remotePkg?.url) {
    return {
      kind: 'unavailable',
      code: 'missing-platform',
      currentVersion: pkg.version,
      latestVersion: rManifest.version,
    };
  }
  if (!isHttpsUrl(remotePkg.url)) {
    throw new AppUpdateError('App update: refusing non-HTTPS package URL', 'not-https');
  }
  if (!isAllowedUpdateUrl(remotePkg.url, pkg.manifestUrl, pkg.updateBaseUrl)) {
    throw new AppUpdateError(
      'Update refused: the download location is not an allowed HTTPS path.',
      'host-not-allowed',
    );
  }
  if (!remotePkg.sha256) {
    throw new AppUpdateError('Remote package is missing sha256', 'missing-sha256');
  }

  return {
    kind: 'available',
    currentVersion: pkg.version,
    latestVersion: rManifest.version,
    platformKey: key!,
    remotePackage: { url: remotePkg.url, sha256: remotePkg.sha256, size: remotePkg.size },
    manifestUrl: pkg.manifestUrl,
  };
}

function unlinkDest(destPath: string, io: AppUpdateIo): void {
  try {
    (io.unlink ?? ((p) => require('fs').unlinkSync(p)))(destPath);
  } catch {
    /* ignore — still throw the integrity error to the caller */
  }
}

function defaultTmpDir(): string {
  const path = require('path') as typeof import('path');
  const os = require('os') as typeof import('os');
  return path.join(os.tmpdir(), 'onlykey-app-updates');
}

export async function downloadAndVerify(
  latestVersion: string,
  remotePackage: { url: string; sha256: string; size?: number },
  io: AppUpdateIo = {},
): Promise<AppUpdateDownloadResult> {
  if (!remotePackage.sha256) {
    throw new AppUpdateError('Remote package is missing sha256', 'missing-sha256');
  }
  if (!isHttpsUrl(remotePackage.url)) {
    throw new AppUpdateError('App update: refusing non-HTTPS package URL', 'not-https');
  }

  const local = readLocalAppPackage(io);
  if (!isAllowedUpdateUrl(remotePackage.url, local.manifestUrl, local.updateBaseUrl)) {
    throw new AppUpdateError(
      'Update refused: the download location is not an allowed HTTPS path.',
      'host-not-allowed',
    );
  }

  const path = require('path') as typeof import('path');
  const fs = require('fs') as typeof import('fs');
  const fileName =
    path.basename(new URL(remotePackage.url).pathname) || `OnlyKey_${latestVersion}.bin`;
  const destDir = io.tmpDir?.() ?? defaultTmpDir();
  const destPath = path.join(destDir, fileName);

  const fetchFn = io.fetchFn ?? fetch.bind(globalThis);
  let downloadRes: Response;
  try {
    downloadRes = await fetchFn(remotePackage.url, fetchInit(io));
  } catch (e) {
    throw asAppUpdateError(e, 'http-package');
  }
  if (!downloadRes.ok) {
    throw new AppUpdateError(
      `Update download failed: HTTP ${downloadRes.status}`,
      'http-package',
      downloadRes.status,
    );
  }

  let body: Uint8Array;
  try {
    body = new Uint8Array(await downloadRes.arrayBuffer());
  } catch (e) {
    throw asAppUpdateError(e, 'io');
  }

  // Manifest `size` is a 5.6-style progress estimate (often rounded MB), not integrity.
  const lengthHeader = Number(downloadRes.headers?.get?.('content-length'));
  const progressTotal =
    Number.isFinite(lengthHeader) && lengthHeader > 0
      ? lengthHeader
      : remotePackage.size && remotePackage.size > 0
        ? remotePackage.size
        : null;
  io.onProgress?.(body.byteLength, progressTotal);

  try {
    verifySha256(body, remotePackage.sha256);
  } catch {
    unlinkDest(destPath, io);
    throw new AppUpdateError(
      'Update package SHA-256 does not match the manifest.',
      'sha256-mismatch',
    );
  }

  try {
    if (io.writeFile) {
      io.writeFile(destPath, body);
    } else {
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(destPath, body);
    }
  } catch (e) {
    unlinkDest(destPath, io);
    throw asAppUpdateError(e, 'io');
  }

  console.info(`Downloaded update to ${destPath}`);
  return {
    destPath,
    version: latestVersion,
    sha256: normalizeSha256(remotePackage.sha256),
    bytes: body.byteLength,
  };
}

export function showUpdateInFolder(destPath: string, io: AppUpdateIo = {}): void {
  (io.showInFolder ?? ((p: string) => nw.Shell.showItemInFolder(p)))(destPath);
}
