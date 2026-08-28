import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_NW_ALLOWLIST,
  copyAllowlistedAppPayload,
} from '../../scripts/release.mjs';
import {
  ensureOfficialNwjsApp,
  ensureOfficialNwjsApps,
  findNwjsApp,
  isMachOBuffer,
  isMachOFile,
  mergeUniversalApp,
  mergeX64IntoArm64App,
  officialCacheAppPath,
  officialNwVersion,
  officialZipUrl,
} from '../../scripts/mac-universal.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function makeTree() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ok-uni-'));
}

function writeNwjsApp(appDir) {
  const bin = path.join(appDir, 'Contents', 'MacOS', 'nwjs');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, 'nwjs-bin');
}

describe('macOS app.nw allowlist', () => {
  it('buildMacDmg copies only the allowlisted payload into app.nw', () => {
    const src = fs.readFileSync(path.join(rootDir, 'scripts', 'release.mjs'), 'utf8');
    expect(src).toContain('copyAllowlistedAppPayload(appDir, appNw)');
    expect(src).not.toContain('copyDir(appDir, appNw)');
    expect(src).toContain('mergeUniversalApp');
  });

  it('does not nest the NW.js runtime inside app.nw', () => {
    expect(APP_NW_ALLOWLIST.has('nwjs.app')).toBe(false);
    expect(APP_NW_ALLOWLIST.has('credits.html')).toBe(false);
    expect(APP_NW_ALLOWLIST.has('locales')).toBe(false);
    expect(APP_NW_ALLOWLIST.has('dist')).toBe(true);
    expect(APP_NW_ALLOWLIST.has('package.json')).toBe(true);
    expect(APP_NW_ALLOWLIST.has('desktopBg.cjs')).toBe(true);
  });

  it('copyAllowlistedAppPayload drops nwjs.app and keeps the payload', () => {
    const src = makeTree();
    const dest = makeTree();
    try {
      fs.mkdirSync(path.join(src, 'dist'));
      fs.writeFileSync(path.join(src, 'dist', 'index.html'), '<html></html>');
      fs.writeFileSync(path.join(src, 'package.json'), '{"name":"OnlyKey"}\n');
      fs.writeFileSync(path.join(src, 'desktopBg.cjs'), 'module.exports = {};\n');
      fs.mkdirSync(path.join(src, 'nwjs.app', 'Contents'), { recursive: true });
      fs.writeFileSync(path.join(src, 'nwjs.app', 'Contents', 'huge.bin'), Buffer.alloc(1024));
      fs.writeFileSync(path.join(src, 'credits.html'), 'credits');

      copyAllowlistedAppPayload(src, dest);

      expect(fs.existsSync(path.join(dest, 'dist', 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(dest, 'package.json'))).toBe(true);
      expect(fs.existsSync(path.join(dest, 'desktopBg.cjs'))).toBe(true);
      expect(fs.existsSync(path.join(dest, 'nwjs.app'))).toBe(false);
      expect(fs.existsSync(path.join(dest, 'credits.html'))).toBe(false);
    } finally {
      fs.rmSync(src, { recursive: true, force: true });
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });
});

describe('universal NW.js merge helpers', () => {
  it('parses the pinned NW.js version and official zip URLs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    expect(officialNwVersion(pkg)).toBe('0.104.1');
    expect(officialNwVersion({ dependencies: { nw: '^0.104.1' } })).toBe('0.104.1');
    expect(officialZipUrl('0.104.1', 'arm64')).toBe(
      'https://dl.nwjs.io/v0.104.1/nwjs-v0.104.1-osx-arm64.zip'
    );
    expect(officialZipUrl('0.104.1', 'x64')).toBe(
      'https://dl.nwjs.io/v0.104.1/nwjs-v0.104.1-osx-x64.zip'
    );
    expect(officialCacheAppPath('0.104.1', 'arm64', '/repo').replace(/\\/g, '/')).toBe(
      '/repo/tmp/nwjs-official/v0.104.1/osx-arm64/nwjs.app'
    );
  });

  it('throws when the NW.js version cannot be parsed', () => {
    expect(() => officialNwVersion({})).toThrow(/Cannot parse NW.js version/);
    expect(() => officialNwVersion({ devDependencies: { nw: 'latest' } })).toThrow(
      /Cannot parse NW.js version/
    );
  });

  it('detects thin and fat Mach-O magic, and rejects Java class files', () => {
    expect(isMachOBuffer(Buffer.alloc(0))).toBe(false);
    expect(isMachOBuffer(Buffer.alloc(3))).toBe(false);

    const thin64 = Buffer.alloc(8);
    thin64.writeUInt32LE(0xfeedfacf, 0);
    expect(isMachOBuffer(thin64)).toBe(true);

    const thin32 = Buffer.alloc(8);
    thin32.writeUInt32LE(0xfeedface, 0);
    expect(isMachOBuffer(thin32)).toBe(true);

    const fat = Buffer.alloc(8);
    fat.writeUInt32LE(0xcafebabe, 0);
    fat.writeUInt32BE(2, 4);
    expect(isMachOBuffer(fat)).toBe(true);

    const fatShort = Buffer.alloc(4);
    fatShort.writeUInt32LE(0xcafebabe, 0);
    expect(isMachOBuffer(fatShort)).toBe(true);

    const javaClass = Buffer.alloc(8);
    javaClass.writeUInt32LE(0xcafebabe, 0);
    javaClass.writeUInt32BE(45, 4);
    expect(isMachOBuffer(javaClass)).toBe(false);
  });

  it('reads Mach-O magic from a file', () => {
    const dir = makeTree();
    try {
      const macho = path.join(dir, 'a.bin');
      const other = path.join(dir, 'b.txt');
      const buf = Buffer.alloc(16);
      buf.writeUInt32LE(0xfeedfacf, 0);
      fs.writeFileSync(macho, buf);
      fs.writeFileSync(other, 'hello');
      expect(isMachOFile(macho)).toBe(true);
      expect(isMachOFile(other)).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('finds a top-level or nested nwjs.app', () => {
    const root = makeTree();
    try {
      expect(() => findNwjsApp(root)).toThrow(/nwjs.app not found/);
      const nested = path.join(root, 'nwjs-v0.104.1-osx-arm64', 'nwjs.app');
      writeNwjsApp(nested);
      expect(findNwjsApp(root)).toBe(nested);

      const directRoot = makeTree();
      try {
        writeNwjsApp(path.join(directRoot, 'nwjs.app'));
        expect(findNwjsApp(directRoot)).toBe(path.join(directRoot, 'nwjs.app'));
      } finally {
        fs.rmSync(directRoot, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('copies x64-only snapshots and keeps arm64 plists/paks', () => {
    const arm = makeTree();
    const x64 = makeTree();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const resArm = path.join(arm, 'Contents', 'Resources');
      const resX64 = path.join(x64, 'Contents', 'Resources');
      fs.mkdirSync(resArm, { recursive: true });
      fs.mkdirSync(resX64, { recursive: true });
      fs.writeFileSync(path.join(resArm, 'icudtl.dat'), 'icu-shared');
      fs.writeFileSync(path.join(resX64, 'icudtl.dat'), 'icu-shared');
      fs.writeFileSync(path.join(resArm, 'shared.pak'), 'pak-a');
      fs.writeFileSync(path.join(resX64, 'shared.pak'), 'pak-x');
      fs.writeFileSync(path.join(resArm, 'PkgInfo'), 'pkg-a');
      fs.writeFileSync(path.join(resX64, 'PkgInfo'), 'pkg-x');
      fs.writeFileSync(path.join(resArm, 'CodeResources'), 'cr-a');
      fs.writeFileSync(path.join(resX64, 'CodeResources'), 'cr-x');
      fs.writeFileSync(path.join(resArm, 'notes.txt'), 'arm-notes');
      fs.writeFileSync(path.join(resX64, 'notes.txt'), 'x64-notes');
      fs.writeFileSync(path.join(resArm, 'v8_context_snapshot.arm64.bin'), 'arm-snap');
      fs.writeFileSync(path.join(resX64, 'v8_context_snapshot.x86_64.bin'), 'x64-snap');
      fs.writeFileSync(path.join(resArm, 'Info.plist'), 'arm-plist');
      fs.writeFileSync(path.join(resX64, 'Info.plist'), 'x64-plist');

      const stats = mergeX64IntoArm64App(x64, arm);
      expect(stats.copiedUnique).toBe(1);
      expect(fs.readFileSync(path.join(resArm, 'v8_context_snapshot.x86_64.bin'), 'utf8')).toBe(
        'x64-snap'
      );
      expect(fs.readFileSync(path.join(resArm, 'Info.plist'), 'utf8')).toBe('arm-plist');
      expect(fs.readFileSync(path.join(resArm, 'shared.pak'), 'utf8')).toBe('pak-a');
      expect(fs.readFileSync(path.join(resArm, 'notes.txt'), 'utf8')).toBe('arm-notes');
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      fs.rmSync(arm, { recursive: true, force: true });
      fs.rmSync(x64, { recursive: true, force: true });
    }
  });

  it('merges a full universal tree and replaces a stale dest', () => {
    const arm = makeTree();
    const x64 = makeTree();
    const destParent = makeTree();
    const dest = path.join(destParent, 'OnlyKey App.app');
    try {
      fs.mkdirSync(path.join(arm, 'Contents'), { recursive: true });
      fs.mkdirSync(path.join(x64, 'Contents'), { recursive: true });
      fs.writeFileSync(path.join(arm, 'Contents', 'icudtl.dat'), 'icu');
      fs.writeFileSync(path.join(x64, 'Contents', 'icudtl.dat'), 'icu');
      fs.writeFileSync(path.join(x64, 'Contents', 'v8_context_snapshot.x86_64.bin'), 'snap');
      fs.mkdirSync(dest, { recursive: true });
      fs.writeFileSync(path.join(dest, 'stale.txt'), 'old');

      const stats = mergeUniversalApp(x64, arm, dest);
      expect(fs.existsSync(path.join(dest, 'stale.txt'))).toBe(false);
      expect(
        fs.readFileSync(path.join(dest, 'Contents', 'v8_context_snapshot.x86_64.bin'), 'utf8')
      ).toBe('snap');
      expect(stats.copiedUnique).toBe(1);
    } finally {
      fs.rmSync(arm, { recursive: true, force: true });
      fs.rmSync(x64, { recursive: true, force: true });
      fs.rmSync(destParent, { recursive: true, force: true });
    }
  });
});

describe('ensureOfficialNwjsApp', () => {
  it('returns a cached nwjs.app without downloading', async () => {
    const root = makeTree();
    try {
      const cached = officialCacheAppPath('0.104.1', 'arm64', root);
      writeNwjsApp(cached);
      const fetchFn = vi.fn();
      const result = await ensureOfficialNwjsApp('0.104.1', 'arm64', root, { fetchFn });
      expect(result).toBe(cached);
      expect(fetchFn).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('downloads and extracts when the cache is empty', async () => {
    const root = makeTree();
    try {
      const fetchFn = vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }));
      const exec = vi.fn((cmd, args) => {
        if (cmd === 'unzip') {
          writeNwjsApp(path.join(args[4], 'nwjs-v0.104.1-osx-arm64', 'nwjs.app'));
        }
      });

      const result = await ensureOfficialNwjsApp('0.104.1', 'arm64', root, {
        fetchFn,
        execFileSync: exec,
      });
      expect(fs.existsSync(path.join(result, 'Contents', 'MacOS', 'nwjs'))).toBe(true);
      expect(fetchFn).toHaveBeenCalledOnce();
      expect(exec).toHaveBeenCalledWith('unzip', expect.any(Array));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('extracts an already-downloaded zip without fetching', async () => {
    const root = makeTree();
    try {
      const zipPath = path.join(
        root,
        'tmp',
        'nwjs-official',
        'v0.104.1',
        'nwjs-v0.104.1-osx-arm64.zip'
      );
      fs.mkdirSync(path.dirname(zipPath), { recursive: true });
      fs.writeFileSync(zipPath, 'zip-bytes');
      const fetchFn = vi.fn();
      const exec = vi.fn((cmd, args) => {
        writeNwjsApp(path.join(args[4], 'nwjs.app'));
      });
      const result = await ensureOfficialNwjsApp('0.104.1', 'arm64', root, {
        fetchFn,
        execFileSync: exec,
      });
      expect(fetchFn).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(result, 'Contents', 'MacOS', 'nwjs'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('replaces a stale cache directory after extract', async () => {
    const root = makeTree();
    try {
      const cached = officialCacheAppPath('0.104.1', 'arm64', root);
      fs.mkdirSync(cached, { recursive: true });
      fs.writeFileSync(path.join(cached, 'stale'), 'old');
      const zipPath = path.join(
        root,
        'tmp',
        'nwjs-official',
        'v0.104.1',
        'nwjs-v0.104.1-osx-arm64.zip'
      );
      fs.mkdirSync(path.dirname(zipPath), { recursive: true });
      fs.writeFileSync(zipPath, 'zip-bytes');
      const result = await ensureOfficialNwjsApp('0.104.1', 'arm64', root, {
        fetchFn: vi.fn(),
        execFileSync: (cmd, args) => {
          writeNwjsApp(path.join(args[4], 'nwjs.app'));
        },
      });
      expect(result).toBe(cached);
      expect(fs.existsSync(path.join(cached, 'stale'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a failed download', async () => {
    const root = makeTree();
    try {
      const fetchFn = vi.fn(async () => ({
        ok: false,
        status: 500,
        arrayBuffer: async () => new ArrayBuffer(0),
      }));
      await expect(
        ensureOfficialNwjsApp('0.104.1', 'x64', root, { fetchFn, execFileSync: vi.fn() })
      ).rejects.toThrow(/HTTP 500/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('deletes a corrupt zip when unzip fails', async () => {
    const root = makeTree();
    try {
      const zipPath = path.join(
        root,
        'tmp',
        'nwjs-official',
        'v0.104.1',
        'nwjs-v0.104.1-osx-x64.zip'
      );
      fs.mkdirSync(path.dirname(zipPath), { recursive: true });
      fs.writeFileSync(zipPath, 'not-a-zip');
      await expect(
        ensureOfficialNwjsApp('0.104.1', 'x64', root, {
          execFileSync: () => {
            throw new Error('unzip boom');
          },
        })
      ).rejects.toThrow(/Failed to unzip/);
      expect(fs.existsSync(zipPath)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves both official apps from cache', async () => {
    const root = makeTree();
    try {
      writeNwjsApp(officialCacheAppPath('0.104.1', 'arm64', root));
      writeNwjsApp(officialCacheAppPath('0.104.1', 'x64', root));
      const apps = await ensureOfficialNwjsApps('0.104.1', root, { fetchFn: vi.fn() });
      expect(apps.arm64App.includes(`${path.sep}osx-arm64${path.sep}`)).toBe(true);
      expect(apps.x64App.includes(`${path.sep}osx-x64${path.sep}`)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
