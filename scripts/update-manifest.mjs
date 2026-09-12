/**
 * Emit the remote app-update manifest from the **signed** installer that will
 * be uploaded. Authenticode / notarization changes file bytes — hashing the
 * unsigned `npm run release` output would fail every client SHA-256 check.
 *
 *   npm run release
 *   # sign in place (same filename: OnlyKey_<ver>.exe / .dmg / _amd64.deb)
 *   npm run update-manifest -- --artifact releases/OnlyKey_5.7.0.exe
 *
 * Writes `releases/update-manifest.d/<win64|mac64|linux64>.json` and merges
 * same-version fragments into `releases/manifest.json`. A one-platform file is
 * publishable; other OSes get `missing-platform`.
 *
 * Env (no AWS credentials in this repo):
 *   ONLYKEY_UPDATE_BASE_URL       — HTTPS prefix for package URLs
 *                                   (default prod S3 `…/releases/latest`)
 *   ONLYKEY_UPDATE_MANIFEST_URL   — baked into packaged `package.json`
 *                                   (`buildProductionPackageJson` in release.mjs)
 *
 * Upload `manifest.json` + the same signed artifact(s) the same way 5.6 was
 * published. This script does not upload.
 *
 * Windows/macOS: refuses `NotSigned` unless `--allow-unsigned`.
 * Client fetches use `{ cache: 'no-store', redirect: 'error' }` (fail-closed).
 * If a staging GET throws TypeError, dump the `Location` header; do not follow
 * HTTP. Path-style `s3.amazonaws.com` is not the same host as virtual-hosted
 * `bucket.s3.<region>.amazonaws.com`.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '..');

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

/** Infer node platform from the installer filename (`OnlyKey_5.7.0.exe` → win32). */
export function inferPlatformFromArtifact(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.exe') return 'win32';
  if (ext === '.dmg') return 'darwin';
  if (ext === '.deb') return 'linux';
  return null;
}

export function inspectAuthenticode(filePath) {
  const ps = [
    `$s = Get-AuthenticodeSignature -LiteralPath ${JSON.stringify(filePath)}`,
    '@{ Status = [string]$s.Status; Signer = [string]$s.SignerCertificate.Subject } | ConvertTo-Json -Compress',
  ].join('; ');
  const out = execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', ps],
    { encoding: 'utf8' },
  );
  const parsed = JSON.parse(out.trim() || '{}');
  return { status: String(parsed.Status || ''), signer: parsed.Signer || '' };
}

export function inspectCodesign(filePath) {
  try {
    execFileSync('codesign', ['--verify', filePath], { encoding: 'utf8', stdio: 'pipe' });
    return { status: 'Valid', signer: '' };
  } catch (e) {
    const err = /** @type {Error & { status?: number, stderr?: string }} */ (e);
    if (err.status == null && /ENOENT|not found/i.test(err.message)) {
      throw new Error(
        'codesign is not available. Hash the notarized DMG on macOS, or pass --allow-unsigned.',
      );
    }
    return { status: 'NotSigned', signer: '' };
  }
}

/**
 * Refuse to hash an installer that is not OS-signed. Signing changes bytes;
 * an unsigned hash must never be published.
 *
 * @param {string} filePath
 * @param {string} platform
 * @param {{
 *   requireSigned?: boolean,
 *   inspectAuthenticode?: (p: string) => { status: string, signer?: string },
 *   inspectCodesign?: (p: string) => { status: string, signer?: string },
 * }} [io]
 */
export function assertSignedArtifact(filePath, platform, io = {}) {
  if (io.requireSigned === false) return { status: 'skipped', signer: '' };
  const key = platformPackageKey(platform);
  if (key === 'linux64') return { status: 'skipped', signer: '' };

  if (key === 'win64') {
    const inspect = io.inspectAuthenticode || inspectAuthenticode;
    const result = inspect(filePath);
    if (result.status === 'NotSigned' || result.status === 'HashMismatch' || !result.status) {
      throw new Error(
        `Refusing to hash an unsigned Windows installer (${result.status || 'unknown'}). Sign in place with Authenticode, then re-run update-manifest on that same file.`,
      );
    }
    return result;
  }

  if (key === 'mac64') {
    const inspect = io.inspectCodesign || inspectCodesign;
    const result = inspect(filePath);
    if (result.status !== 'Valid') {
      throw new Error(
        `Refusing to hash an unsigned macOS installer (${result.status}). Notarize/sign the DMG, then re-run update-manifest on that same file.`,
      );
    }
    return result;
  }

  throw new Error(`No update-manifest platform key for ${platform}`);
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
 *   requireSigned?: boolean,
 *   inspectAuthenticode?: (p: string) => { status: string, signer?: string },
 *   inspectCodesign?: (p: string) => { status: string, signer?: string },
 *   log?: { log: (...args: unknown[]) => void, warn?: (...args: unknown[]) => void },
 * }} opts
 */
export function recordReleaseArtifact(opts) {
  const log = opts.log || console;
  const platform = opts.platform || inferPlatformFromArtifact(opts.artifactPath) || process.platform;
  const key = platformPackageKey(platform);
  if (!key) {
    throw new Error(`No update-manifest platform key for ${platform}`);
  }
  const signature = assertSignedArtifact(opts.artifactPath, platform, {
    requireSigned: opts.requireSigned,
    inspectAuthenticode: opts.inspectAuthenticode,
    inspectCodesign: opts.inspectCodesign,
  });
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
  if (signature.status && signature.status !== 'skipped') {
    log.log(`  signature: ${signature.status}${signature.signer ? `  ${signature.signer}` : ''}`);
  }
  log.log('Upload THIS signed file together with manifest.json (same bytes as the hash).');
  log.log(
    'Do not upload an unsigned copy or a file signed after this hash was taken.',
  );
  log.log(`  default: s3://onlykey-app/releases/latest/  (${DEFAULT_UPDATE_BASE_URL})`);
  log.log('This script does not upload. There are no AWS credentials in this repo.');
  if (keys.length < PLATFORM_KEYS.length) {
    log.log(
      `This manifest has ${keys.join(', ') || 'no platforms'}. A one-platform manifest is publishable; other OSes get missing-platform (auto-check silent; Check now shows an error).`,
    );
  }
  return { outPath, manifest: merged, sha256, size, key, signature };
}

export function parseUpdateManifestArgs(argv) {
  /** @type {{ artifact?: string, version?: string, platform?: string, releasesDir?: string, allowUnsigned: boolean, help: boolean }} */
  const out = { allowUnsigned: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new Error(`Missing value for ${a}`);
      return v;
    };
    if (a === '--artifact') out.artifact = next();
    else if (a === '--version') out.version = next();
    else if (a === '--platform') out.platform = next();
    else if (a === '--releases-dir') out.releasesDir = next();
    else if (a === '--allow-unsigned') out.allowUnsigned = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function usage() {
  return `Usage: node scripts/update-manifest.mjs --artifact <signed-installer>

Hash the SIGNED installer (Authenticode / notarized DMG / shipped .deb) and
merge releases/manifest.json. Sign in place so the filename stays
OnlyKey_<ver>.exe / .dmg / _amd64.deb.

  --artifact <path>     signed installer (required)
  --version <semver>    default: package.json version
  --platform <id>       win32|darwin|linux (default: from filename)
  --releases-dir <dir>  default: ./releases
  --allow-unsigned      skip Authenticode/codesign check (do not publish)
`;
}

function readPkg() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
}

function main(argv = process.argv.slice(2)) {
  const args = parseUpdateManifestArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (!args.artifact) {
    console.error(usage());
    return 1;
  }
  const pkg = readPkg();
  recordReleaseArtifact({
    artifactPath: path.resolve(args.artifact),
    version: args.version || pkg.version,
    platform: args.platform || inferPlatformFromArtifact(args.artifact) || process.platform,
    releasesDir: path.resolve(args.releasesDir || path.join(repoRoot, 'releases')),
    name: pkg.name,
    productName: pkg.productName,
    requireSigned: !args.allowUnsigned,
  });
  return 0;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return (
      path.normalize(fileURLToPath(import.meta.url)).toLowerCase() ===
      path.normalize(path.resolve(entry)).toLowerCase()
    );
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    const code = main();
    if (code) process.exit(code);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
