/**
 * Emit the remote app-update manifest after `npm run release`.
 *
 * Each OS build writes `releases/update-manifest.d/<win64|mac64|linux64>.json`
 * and merges whatever fragments share this version into `releases/manifest.json`.
 * A one-platform file is publishable; other OSes get `missing-platform`.
 *
 * Env (pack-time, no AWS credentials in this repo):
 *   ONLYKEY_UPDATE_BASE_URL       — HTTPS prefix for package URLs
 *                                   (default prod S3 `…/releases/latest`)
 *   ONLYKEY_UPDATE_MANIFEST_URL   — baked into packaged `package.json`
 *                                   (`buildProductionPackageJson` in release.mjs)
 *
 * Upload `manifest.json` + the new artifact(s) the same way 5.6 was published.
 * This script does not upload.
 *
 * Client fetches use `{ cache: 'no-store', redirect: 'error' }` (fail-closed).
 * If a staging GET throws TypeError, dump the `Location` header; do not follow
 * HTTP. Path-style `s3.amazonaws.com` is not the same host as virtual-hosted
 * `bucket.s3.<region>.amazonaws.com`.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_UPDATE_BASE_URL =
  'https://s3.amazonaws.com/onlykey-app/releases/latest';
export const DEFAULT_UPDATE_MANIFEST_URL = `${DEFAULT_UPDATE_BASE_URL}/manifest.json`;

export const PLATFORM_KEYS = /** @type {const} */ (['win64', 'mac64', 'linux64']);
const SHA256_HEX = /^[a-f0-9]{64}$/;

export function normalizeBaseUrl(url) {
  return String(url || '').replace(/\/+$/, '');
}

export function normalizeManifestUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return DEFAULT_UPDATE_MANIFEST_URL;
  return raw;
}

/** Trailing slash, for packaged `updateBaseUrl`. */
export function normalizeUpdateBaseUrl(url) {
  const base = normalizeBaseUrl(url);
  return base ? `${base}/` : undefined;
}

/**
 * @param {NodeJS.Platform | 'windows' | 'osx' | 'mac' | string} platform
 * @returns {(typeof PLATFORM_KEYS)[number] | null}
 */
export function platformPackageKey(platform = process.platform) {
  if (platform === 'win32' || platform === 'windows') return 'win64';
  if (platform === 'darwin' || platform === 'osx' || platform === 'mac') return 'mac64';
  if (platform === 'linux') return 'linux64';
  return null;
}

export function assertSha256(value, label = 'sha256') {
  const hex = String(value || '').trim().toLowerCase();
  if (!SHA256_HEX.test(hex)) {
    throw new Error(`${label} must be a 64-character lowercase hex SHA-256`);
  }
  return hex;
}

/** Stream the file so a ~100 MB installer is not held as one buffer. */
export function hashFile(filePath) {
  const size = fs.statSync(filePath).size;
  const hash = createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(64 * 1024);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return { sha256: hash.digest('hex'), size };
}

/**
 * @param {string} dir `releases/update-manifest.d`
 * @param {{
 *   platformKey: (typeof PLATFORM_KEYS)[number],
 *   version: string,
 *   artifactName: string,
 *   sha256: string,
 *   size: number,
 *   baseUrl?: string,
 * }} opts
 */
export function writeFragment(dir, opts) {
  const key = opts.platformKey;
  if (!PLATFORM_KEYS.includes(key)) {
    throw new Error(`Unknown platform key: ${key}`);
  }
  const sha256 = assertSha256(opts.sha256, `${key} sha256`);
  const baseUrl = normalizeBaseUrl(opts.baseUrl || DEFAULT_UPDATE_BASE_URL);
  const artifactName = path.basename(opts.artifactName);
  const fragment = {
    version: opts.version,
    key,
    package: {
      url: `${baseUrl}/${artifactName}`,
      size: opts.size,
      sha256,
    },
  };
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${key}.json`);
  fs.writeFileSync(dest, `${JSON.stringify(fragment, null, 2)}\n`);
  return dest;
}

/**
 * @param {string} dir
 * @param {{ version: string, name?: string, productName?: string, now?: string }} opts
 */
export function mergeFragments(dir, opts) {
  const packages = {};
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
    for (const name of files) {
      const filePath = path.join(dir, name);
      let raw;
      try {
        raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch {
        throw new Error(`Update-manifest fragment ${name} is not valid JSON`);
      }
      if (raw.version !== opts.version) {
        console.warn(
          `Dropping fragment ${name}: version ${raw.version} != ${opts.version}`,
        );
        continue;
      }
      const key = raw.key;
      if (!PLATFORM_KEYS.includes(key)) {
        throw new Error(`Update-manifest fragment ${name} has unknown key ${key}`);
      }
      const sha256 = raw.package?.sha256;
      if (!sha256) {
        throw new Error(`Update-manifest fragment ${name} is missing sha256`);
      }
      const hex = assertSha256(sha256, `${name} sha256`);
      packages[key] = {
        url: raw.package.url,
        size: raw.package.size,
        sha256: hex,
      };
    }
  }

  return {
    name: opts.name || 'OnlyKey',
    productName: opts.productName || 'OnlyKey App',
    version: opts.version,
    publishedAt: opts.now || new Date().toISOString(),
    packages,
  };
}

/**
 * Hash the OS artifact, write its fragment, merge, print the upload reminder.
 *
 * @param {{
 *   artifactPath: string,
 *   version: string,
 *   releasesDir: string,
 *   platform?: string,
 *   baseUrl?: string,
 *   name?: string,
 *   productName?: string,
 *   now?: string,
 *   log?: { log: (...args: unknown[]) => void, warn?: (...args: unknown[]) => void },
 * }} opts
 */
export function recordReleaseArtifact(opts) {
  const log = opts.log || console;
  const platform = opts.platform || process.platform;
  const key = platformPackageKey(platform);
  if (!key) {
    throw new Error(`No update-manifest platform key for ${platform}`);
  }
  const baseUrl = opts.baseUrl || process.env.ONLYKEY_UPDATE_BASE_URL || DEFAULT_UPDATE_BASE_URL;
  const { sha256, size } = hashFile(opts.artifactPath);
  const fragmentDir = path.join(opts.releasesDir, 'update-manifest.d');
  writeFragment(fragmentDir, {
    platformKey: key,
    version: opts.version,
    artifactName: path.basename(opts.artifactPath),
    sha256,
    size,
    baseUrl,
  });
  const merged = mergeFragments(fragmentDir, {
    version: opts.version,
    name: opts.name,
    productName: opts.productName,
    now: opts.now,
  });
  const outPath = path.join(opts.releasesDir, 'manifest.json');
  fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`);

  const keys = Object.keys(merged.packages);
  log.log(`Wrote update manifest: ${outPath}`);
  log.log(`  ${key}  sha256=${sha256}  size=${size}`);
  log.log(
    'Upload manifest.json together with the new artifact(s) to the same S3 prefix as 5.6',
  );
  log.log(`  default: s3://onlykey-app/releases/latest/  (${DEFAULT_UPDATE_BASE_URL})`);
  log.log('This build does not upload. There are no AWS credentials in this repo.');
  if (keys.length < PLATFORM_KEYS.length) {
    log.log(
      `This manifest has ${keys.join(', ') || 'no platforms'}. A one-platform manifest is publishable; other OSes get missing-platform (auto-check silent; Check now shows an error).`,
    );
  }
  return { outPath, manifest: merged, sha256, size, key };
}
