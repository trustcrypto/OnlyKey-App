/**
 * Download official NW.js macOS zips and merge them into one universal .app.
 *
 * Chromium already names V8 snapshots per arch (v8_context_snapshot.x86_64.bin /
 * v8_context_snapshot.arm64.bin) so both files sit side-by-side. Mach-O binaries
 * are joined with lipo. Shared resources (icu, .pak) are stored once.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, '..');

const MACHO_MAGIC = new Set([
  0xfeedface, 0xcefaedfe, // 32-bit
  0xfeedfacf, 0xcffaedfe, // 64-bit
]);
const FAT_MAGIC = new Set([0xcafebabe, 0xbebafeca]);
const FAT_ARCH_DISAMBIGUATION_THRESHOLD = 30;

export function officialNwVersion(pkg) {
  const raw = pkg?.devDependencies?.nw ?? pkg?.dependencies?.nw ?? '';
  const match = String(raw).match(/(\d+\.\d+\.\d+)/);
  if (!match) {
    throw new Error(`Cannot parse NW.js version from package.json (got ${JSON.stringify(raw)})`);
  }
  return match[1];
}

export function isMachOBuffer(header) {
  if (!header || header.length < 4) return false;
  const magicLe = header.readUInt32LE(0);
  if (MACHO_MAGIC.has(magicLe)) return true;
  if (FAT_MAGIC.has(magicLe)) {
    if (header.length < 8) return true;
    return header.readUInt32BE(4) < FAT_ARCH_DISAMBIGUATION_THRESHOLD;
  }
  return false;
}

export function isMachOFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(8);
    const n = fs.readSync(fd, buf, 0, 8, 0);
    return isMachOBuffer(buf.subarray(0, n));
  } finally {
    fs.closeSync(fd);
  }
}

function filesEqual(a, b) {
  const sa = fs.statSync(a);
  const sb = fs.statSync(b);
  if (sa.size !== sb.size) return false;
  const ha = crypto.createHash('sha256');
  const hb = crypto.createHash('sha256');
  ha.update(fs.readFileSync(a));
  hb.update(fs.readFileSync(b));
  return ha.digest('hex') === hb.digest('hex');
}

function ensureWritable(filePath) {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    /* ignore */
  }
}

function lipoCreate(x64Path, arm64Path, destPath) {
  const tmp = `${destPath}.lipo-tmp`;
  ensureWritable(destPath);
  execFileSync('lipo', ['-create', x64Path, arm64Path, '-output', tmp]);
  fs.renameSync(tmp, destPath);
  fs.chmodSync(destPath, 0o755);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      fs.symlinkSync(fs.readlinkSync(srcPath), destPath);
    } else if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function pathExists(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Overlay the x64 tree onto a dest tree that already contains the arm64 app.
 * Unique x64 files (V8 snapshots) are copied; Mach-O files are lipo'd.
 */
export function mergeX64IntoArm64App(x64App, destApp) {
  let lipoCount = 0;
  let copiedUnique = 0;

  const walk = (rel) => {
    const x64Dir = path.join(x64App, rel);
    for (const entry of fs.readdirSync(x64Dir, { withFileTypes: true })) {
      const relChild = path.join(rel, entry.name);
      const src = path.join(x64App, relChild);
      const dest = path.join(destApp, relChild);

      if (entry.isSymbolicLink()) {
        if (!pathExists(dest)) {
          fs.symlinkSync(fs.readlinkSync(src), dest);
          copiedUnique++;
        }
        continue;
      }

      if (entry.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        walk(relChild);
        continue;
      }

      if (!pathExists(dest)) {
        fs.copyFileSync(src, dest);
        copiedUnique++;
        continue;
      }

      if (isMachOFile(src) && isMachOFile(dest)) {
        lipoCreate(src, dest, dest);
        lipoCount++;
        continue;
      }

      if (filesEqual(src, dest)) continue;

      const base = entry.name;
      if (
        base === 'Info.plist' ||
        base === 'PkgInfo' ||
        base === 'CodeResources' ||
        base.endsWith('.pak') ||
        base.endsWith('.pak.info')
      ) {
        continue;
      }

      console.warn(`Keeping arm64 copy of differing non-Mach-O file: ${relChild}`);
    }
  };

  walk('');
  return { lipoCount, copiedUnique };
}

export function mergeUniversalApp(x64App, arm64App, destApp) {
  if (fs.existsSync(destApp)) fs.rmSync(destApp, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destApp), { recursive: true });
  copyDir(arm64App, destApp);
  const stats = mergeX64IntoArm64App(x64App, destApp);
  try {
    execFileSync('xattr', ['-cr', destApp]);
  } catch {
    /* xattr may be missing in some CI images; quarantine is optional */
  }
  console.log(
    `Universal merge: lipo'd ${stats.lipoCount} Mach-O file(s), copied ${stats.copiedUnique} x64-only file(s).`
  );
  return stats;
}

export function findNwjsApp(extractRoot) {
  const direct = path.join(extractRoot, 'nwjs.app');
  if (fs.existsSync(path.join(direct, 'Contents', 'MacOS', 'nwjs'))) return direct;
  for (const entry of fs.readdirSync(extractRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const cand = path.join(extractRoot, entry.name, 'nwjs.app');
    if (fs.existsSync(path.join(cand, 'Contents', 'MacOS', 'nwjs'))) return cand;
  }
  throw new Error(`nwjs.app not found under ${extractRoot}`);
}

export function officialZipUrl(version, arch) {
  return `https://dl.nwjs.io/v${version}/nwjs-v${version}-osx-${arch}.zip`;
}

export function officialCacheAppPath(version, arch, root = repoRoot) {
  return path.join(root, 'tmp', 'nwjs-official', `v${version}`, `osx-${arch}`, 'nwjs.app');
}

async function downloadToFile(url, destPath, fetchFn) {
  console.log(`Downloading ${url}`);
  const res = await fetchFn(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  console.log(`Saved ${path.basename(destPath)} (${Math.round(buf.length / 1024 / 1024)} MB)`);
}

export async function ensureOfficialNwjsApp(version, arch, root = repoRoot, io = {}) {
  const exec = io.execFileSync ?? execFileSync;
  const fetchFn = io.fetchFn ?? fetch.bind(globalThis);

  const cached = officialCacheAppPath(version, arch, root);
  if (fs.existsSync(path.join(cached, 'Contents', 'MacOS', 'nwjs'))) {
    console.log(`Using cached NW.js ${version} osx-${arch}`);
    return cached;
  }

  const cacheDir = path.dirname(cached);
  const zipPath = path.join(path.dirname(cacheDir), `nwjs-v${version}-osx-${arch}.zip`);
  if (!fs.existsSync(zipPath)) {
    await downloadToFile(officialZipUrl(version, arch), zipPath, fetchFn);
  }

  const extractDir = `${cacheDir}-extract`;
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  console.log(`Extracting ${path.basename(zipPath)}…`);
  try {
    exec('unzip', ['-q', '-o', zipPath, '-d', extractDir]);
  } catch (err) {
    fs.rmSync(zipPath, { force: true });
    fs.rmSync(extractDir, { recursive: true, force: true });
    throw new Error(
      `Failed to unzip ${zipPath} (deleted cache; retry will re-download): ${err.message}`
    );
  }

  const extractedApp = findNwjsApp(extractDir);
  fs.mkdirSync(cacheDir, { recursive: true });
  if (fs.existsSync(cached)) fs.rmSync(cached, { recursive: true, force: true });
  copyDir(extractedApp, cached);
  fs.rmSync(extractDir, { recursive: true, force: true });
  return cached;
}

export async function ensureOfficialNwjsApps(version, root = repoRoot, io = {}) {
  const [arm64App, x64App] = await Promise.all([
    ensureOfficialNwjsApp(version, 'arm64', root, io),
    ensureOfficialNwjsApp(version, 'x64', root, io),
  ]);
  return { arm64App, x64App };
}
