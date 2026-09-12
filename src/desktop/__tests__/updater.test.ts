import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from 'js-sha256';
import { userPreferences } from '../userPreferences';
import {
  APP_UPDATE_SESSION_KEY,
  AppUpdateError,
  DEFAULT_MANIFEST_URL,
  checkAppUpdate,
  compareSemver,
  downloadAndVerify,
  isAllowedUpdateUrl,
  isHttpsUrl,
  normalizeSha256,
  readLocalAppPackage,
  showUpdateInFolder,
  updateUrlPrefix,
  verifySha256,
} from '../updater';

const MANIFEST = 'https://example.com/manifest.json';
const S3_MANIFEST = 'https://s3.amazonaws.com/onlykey-app/releases/latest/manifest.json';
const S3_PKG = 'https://s3.amazonaws.com/onlykey-app/releases/latest/OnlyKey_5.7.1.exe';

function hashBody(bytes: number[]): { body: Uint8Array; hash: string } {
  const body = new Uint8Array(bytes);
  return { body, hash: sha256(body) };
}

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body, headers: { get: () => null } };
}

function binRes(bytes: Uint8Array, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: { get: () => String(bytes.byteLength) },
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function streamBinRes(chunks: Uint8Array[], ok = true, status = 200) {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  let i = 0;
  return {
    ok,
    status,
    headers: { get: () => String(total) },
    body: {
      getReader: () => ({
        read: async () => {
          if (i >= chunks.length) return { done: true, value: undefined };
          return { done: false, value: chunks[i++] };
        },
        cancel: async () => undefined,
      }),
    },
    arrayBuffer: async () => {
      throw new Error('stream path should not fall back to arrayBuffer');
    },
  };
}

function packagesFor(url: string, sha256Hex: string, size?: number) {
  const pkg = { url, sha256: sha256Hex, ...(size != null ? { size } : {}) };
  return { win64: pkg, mac64: pkg, linux64: pkg };
}

function readPkg(manifestUrl = MANIFEST) {
  return () => ({ version: '5.7.0', manifestUrl });
}

describe('updater helpers', () => {
  it('compares semver', () => {
    expect(compareSemver('5.7.1', '5.7.0')).toBe(1);
    expect(compareSemver('5.7.0', '5.7.0')).toBe(0);
    expect(compareSemver('5.6.9', '5.7.0')).toBe(-1);
  });

  it('treats a pre-release as less than the same numeric core', () => {
    expect(compareSemver('5.7.0-beta', '5.7.0')).toBe(-1);
    expect(compareSemver('5.7.0', '5.7.0-beta')).toBe(1);
    expect(compareSemver('v5.7.0-beta', '5.7.0-beta')).toBe(0);
  });

  it('accepts only https URLs', () => {
    expect(isHttpsUrl('https://example.com/a')).toBe(true);
    expect(isHttpsUrl('http://example.com/a')).toBe(false);
    expect(isHttpsUrl('not-a-url')).toBe(false);
  });

  it('verifies sha256 of the installer bytes', () => {
    const body = new Uint8Array([1, 2, 3, 4]);
    expect(() => verifySha256(body, sha256(body))).not.toThrow();
    expect(() => verifySha256(body, 'deadbeef')).toThrow(/SHA-256/);
    expect(normalizeSha256('SHA256:AbC')).toBe('abc');
  });

  it('builds a trailing-slash prefix from the manifest URL', () => {
    expect(updateUrlPrefix(S3_MANIFEST)).toBe(
      'https://s3.amazonaws.com/onlykey-app/releases/latest/',
    );
    expect(updateUrlPrefix(S3_MANIFEST, 'https://s3.amazonaws.com/onlykey-app/releases/5.7-staging')).toBe(
      'https://s3.amazonaws.com/onlykey-app/releases/5.7-staging/',
    );
  });

  it('allows package URLs only under the manifest origin and path prefix', () => {
    expect(isAllowedUpdateUrl(S3_PKG, S3_MANIFEST)).toBe(true);
    expect(isAllowedUpdateUrl('https://example.com/OnlyKey.exe', MANIFEST)).toBe(true);
    expect(isAllowedUpdateUrl('https://example.com/OnlyKey.exe', S3_MANIFEST)).toBe(false);
    expect(
      isAllowedUpdateUrl('https://s3.amazonaws.com/other-bucket/malware.exe', S3_MANIFEST),
    ).toBe(false);
    expect(
      isAllowedUpdateUrl('https://evil.s3.amazonaws.com/onlykey-app/releases/latest/x.exe', S3_MANIFEST),
    ).toBe(false);
    expect(isAllowedUpdateUrl('http://s3.amazonaws.com/onlykey-app/releases/latest/x.exe', S3_MANIFEST)).toBe(
      false,
    );
  });
});

describe('readLocalAppPackage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses io.readPackage as the test seam', () => {
    expect(
      readLocalAppPackage({
        readPackage: () => ({ version: '5.7.0', manifestUrl: MANIFEST, updateBaseUrl: 'https://example.com/' }),
      }),
    ).toEqual({
      version: '5.7.0',
      manifestUrl: MANIFEST,
      updateBaseUrl: 'https://example.com/',
    });
    expect(readLocalAppPackage({ readPackage: () => ({ version_name: '5.7.0' }) })).toEqual({
      version: '5.7.0',
      manifestUrl: DEFAULT_MANIFEST_URL,
      updateBaseUrl: undefined,
    });
  });

  it('prefers nw.App.manifest when startPath is / (26)', () => {
    vi.stubGlobal('nw', {
      App: {
        startPath: '/',
        manifest: {
          version: '5.7.0',
          version_name: '5.7.0',
          manifestUrl: DEFAULT_MANIFEST_URL,
        },
      },
    });
    const existsSync = vi.fn(() => {
      throw new Error('must not probe /package.json');
    });
    const pkg = readLocalAppPackage({
      resolveAppRoot: () => '/',
    });
    expect(pkg).toEqual({
      version: '5.7.0',
      manifestUrl: DEFAULT_MANIFEST_URL,
      updateBaseUrl: undefined,
    });
    expect(existsSync).not.toHaveBeenCalled();
  });

  it('reads resolveAppRoot()/package.json when startPath is / and manifest is empty (26b)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ok-app-root-'));
    try {
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          version: '5.7.0',
          version_name: '5.7.0',
          manifestUrl: DEFAULT_MANIFEST_URL,
        }),
      );
      vi.stubGlobal('nw', { App: { startPath: '/', manifest: {} } });
      const pkg = readLocalAppPackage({ resolveAppRoot: () => dir });
      expect(pkg).toEqual({
        version: '5.7.0',
        manifestUrl: DEFAULT_MANIFEST_URL,
        updateBaseUrl: undefined,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('checkAppUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.stubGlobal('nw', { App: { startPath: '/tmp', manifest: { version_name: '5.7.0' } } });
  });

  it('skips when autoUpdate is off and force is false (1)', async () => {
    userPreferences.autoUpdate = false;
    const fetchFn = vi.fn();
    await expect(
      checkAppUpdate({ fetchFn: fetchFn as never, readPackage: readPkg() }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'pref-disabled' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetches when force is true even if the pref is off (2)', async () => {
    const fetchFn = vi.fn(async () => jsonRes({ version: '5.7.0', packages: {} }));
    const result = await checkAppUpdate(
      { fetchFn: fetchFn as never, readPackage: readPkg() },
      { force: true },
    );
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(result.kind).toBe('current');
  });

  it('skips when not desktop (3)', async () => {
    const fetchFn = vi.fn();
    await expect(
      checkAppUpdate({ fetchFn: fetchFn as never, isDesktop: () => false }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'not-desktop' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('skips a second auto-check in the same session (4)', async () => {
    userPreferences.autoUpdate = true;
    const fetchFn = vi.fn(async () => jsonRes({ version: '5.7.0', packages: {} }));
    const io = { fetchFn: fetchFn as never, readPackage: readPkg() };
    await checkAppUpdate(io);
    fetchFn.mockClear();
    await expect(checkAppUpdate(io)).resolves.toEqual({
      kind: 'skipped',
      reason: 'already-checked',
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(APP_UPDATE_SESSION_KEY)).toBe('1');
  });

  it('hits the network on force even with a session key (5)', async () => {
    sessionStorage.setItem(APP_UPDATE_SESSION_KEY, '1');
    const fetchFn = vi.fn(async () => jsonRes({ version: '5.7.0', packages: {} }));
    const result = await checkAppUpdate(
      { fetchFn: fetchFn as never, readPackage: readPkg() },
      { force: true },
    );
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(result.kind).toBe('current');
  });

  it('refuses a non-HTTPS manifest (6)', async () => {
    await expect(
      checkAppUpdate({
        readPackage: () => ({ version: '5.7.0', manifestUrl: 'http://evil.example/manifest.json' }),
      }, { force: true }),
    ).rejects.toMatchObject({ code: 'not-https' });
  });

  it('refuses a package host or path outside the prefix (7)', async () => {
    const { hash } = hashBody([1]);
    const fetchFn = vi.fn(async () =>
      jsonRes({
        version: '5.7.1',
        packages: packagesFor('https://example.com/OnlyKey.exe', hash, 1),
      }),
    );
    await expect(
      checkAppUpdate(
        { fetchFn: fetchFn as never, readPackage: readPkg(S3_MANIFEST) },
        { force: true },
      ),
    ).rejects.toMatchObject({ code: 'host-not-allowed' });

    fetchFn.mockResolvedValueOnce(
      jsonRes({
        version: '5.7.1',
        packages: packagesFor('https://s3.amazonaws.com/other-bucket/malware.exe', hash, 1),
      }) as never,
    );
    await expect(
      checkAppUpdate(
        { fetchFn: fetchFn as never, readPackage: readPkg(S3_MANIFEST) },
        { force: true },
      ),
    ).rejects.toMatchObject({ code: 'host-not-allowed' });

    fetchFn.mockResolvedValueOnce(
      jsonRes({
        version: '5.7.1',
        packages: packagesFor(
          'https://evil.s3.amazonaws.com/onlykey-app/releases/latest/x.exe',
          hash,
          1,
        ),
      }) as never,
    );
    await expect(
      checkAppUpdate(
        { fetchFn: fetchFn as never, readPackage: readPkg(S3_MANIFEST) },
        { force: true },
      ),
    ).rejects.toMatchObject({ code: 'host-not-allowed' });
  });

  it('allows a package URL under the manifest directory (7b)', async () => {
    const { hash } = hashBody([1, 2, 3]);
    const result = await checkAppUpdate(
      {
        fetchFn: vi.fn(async () =>
          jsonRes({
            version: '5.7.1',
            packages: packagesFor(S3_PKG, hash, 3),
          }),
        ) as never,
        readPackage: readPkg(S3_MANIFEST),
      },
      { force: true },
    );
    expect(result).toMatchObject({
      kind: 'available',
      latestVersion: '5.7.1',
      remotePackage: { url: S3_PKG, sha256: hash, size: 3 },
    });
  });

  it('throws http-manifest on 404/502 (8)', async () => {
    await expect(
      checkAppUpdate(
        {
          fetchFn: vi.fn(async () => jsonRes({}, false, 404)) as never,
          readPackage: readPkg(),
        },
        { force: true },
      ),
    ).rejects.toMatchObject({ code: 'http-manifest', httpStatus: 404 });
  });

  it('fetches the manifest with redirect: error (9)', async () => {
    const fetchFn = vi.fn(async () => jsonRes({ version: '5.7.0', packages: {} }));
    await checkAppUpdate({ fetchFn: fetchFn as never, readPackage: readPkg() }, { force: true });
    expect(fetchFn).toHaveBeenCalledWith(
      MANIFEST,
      expect.objectContaining({ cache: 'no-store', redirect: 'error' }),
    );
  });

  it('treats an equal version as current (10)', async () => {
    const result = await checkAppUpdate(
      {
        fetchFn: vi.fn(async () => jsonRes({ version: '5.7.0', packages: {} })) as never,
        readPackage: readPkg(),
      },
      { force: true },
    );
    expect(result).toEqual({ kind: 'current', currentVersion: '5.7.0', latestVersion: '5.7.0' });
  });

  it('treats an older remote as current (11)', async () => {
    const result = await checkAppUpdate(
      {
        fetchFn: vi.fn(async () => jsonRes({ version: '5.3.4', packages: {} })) as never,
        readPackage: readPkg(),
      },
      { force: true },
    );
    expect(result).toEqual({ kind: 'current', currentVersion: '5.7.0', latestVersion: '5.3.4' });
  });

  it('returns unavailable when the platform package is missing (12)', async () => {
    const result = await checkAppUpdate(
      {
        fetchFn: vi.fn(async () => jsonRes({ version: '5.7.1', packages: {} })) as never,
        readPackage: readPkg(),
        platform: () => 'win32',
      },
      { force: true },
    );
    expect(result).toEqual({
      kind: 'unavailable',
      code: 'missing-platform',
      currentVersion: '5.7.0',
      latestVersion: '5.7.1',
    });
  });

  it('throws missing-sha256 without GET of the installer (13)', async () => {
    const fetchFn = vi.fn(async () =>
      jsonRes({
        version: '5.7.1',
        packages: packagesFor('https://example.com/OnlyKey.exe', ''),
      }),
    );
    await expect(
      checkAppUpdate({ fetchFn: fetchFn as never, readPackage: readPkg() }, { force: true }),
    ).rejects.toMatchObject({ code: 'missing-sha256' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('throws invalid-manifest on bad JSON or a missing version', async () => {
    await expect(
      checkAppUpdate(
        {
          fetchFn: vi.fn(async () => ({
            ok: true,
            json: async () => {
              throw new Error('not json');
            },
          })) as never,
          readPackage: readPkg(),
        },
        { force: true },
      ),
    ).rejects.toMatchObject({ code: 'invalid-manifest' });

    await expect(
      checkAppUpdate(
        {
          fetchFn: vi.fn(async () => jsonRes({ packages: {} })) as never,
          readPackage: readPkg(),
        },
        { force: true },
      ),
    ).rejects.toMatchObject({ code: 'invalid-manifest' });
  });

  it('throws io when the local version is missing or the manifest fetch throws', async () => {
    await expect(
      checkAppUpdate({ readPackage: () => ({ manifestUrl: MANIFEST }) }, { force: true }),
    ).rejects.toMatchObject({ code: 'io' });

    await expect(
      checkAppUpdate(
        {
          fetchFn: vi.fn(async () => {
            throw new Error('offline');
          }) as never,
          readPackage: readPkg(),
        },
        { force: true },
      ),
    ).rejects.toMatchObject({ code: 'io', message: 'offline' });
  });

  it('throws not-https for an http package URL and unavailable for an unknown platform', async () => {
    const { hash } = hashBody([1]);
    await expect(
      checkAppUpdate(
        {
          fetchFn: vi.fn(async () =>
            jsonRes({
              version: '5.7.1',
              packages: packagesFor('http://example.com/OnlyKey.exe', hash, 1),
            }),
          ) as never,
          readPackage: readPkg(),
        },
        { force: true },
      ),
    ).rejects.toMatchObject({ code: 'not-https' });

    const result = await checkAppUpdate(
      {
        fetchFn: vi.fn(async () =>
          jsonRes({
            version: '5.7.1',
            packages: packagesFor('https://example.com/OnlyKey.exe', hash, 1),
          }),
        ) as never,
        readPackage: readPkg(),
        platform: () => 'aix' as NodeJS.Platform,
      },
      { force: true },
    );
    expect(result.kind).toBe('unavailable');
  });
});

describe('downloadAndVerify', () => {
  const { body, hash } = hashBody([9, 8, 7]);

  beforeEach(() => {
    vi.stubGlobal('nw', { App: { startPath: '/tmp', manifest: { version_name: '5.7.0' } } });
  });

  it('does not fetch the installer when checkAppUpdate returns available (14)', async () => {
    const unusedDownloadFetch = vi.fn();
    const result = await checkAppUpdate(
      {
        fetchFn: vi.fn(async () =>
          jsonRes({
            version: '5.7.1',
            packages: packagesFor('https://example.com/OnlyKey.exe', hash, 3),
          }),
        ) as never,
        readPackage: readPkg(),
      },
      { force: true },
    );
    expect(result.kind).toBe('available');
    expect(unusedDownloadFetch).not.toHaveBeenCalled();
  });

  it('throws http-package on HTTP 502 (15)', async () => {
    await expect(
      downloadAndVerify(
        '5.7.1',
        { url: 'https://example.com/OnlyKey.exe', sha256: hash, size: 3 },
        {
          fetchFn: vi.fn(async () => ({ ok: false, status: 502 })) as never,
          readPackage: readPkg(),
        },
      ),
    ).rejects.toMatchObject({ code: 'http-package', httpStatus: 502 });
  });

  it('treats a rounded manifest size as progress only, not integrity (16)', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const written: Array<{ path: string; data: Uint8Array }> = [];
    const unlink = vi.fn();
    const onProgress = vi.fn();
    const result = await downloadAndVerify(
      '5.7.1',
      { url: 'https://example.com/OnlyKey.exe', sha256: hash, size: 67_000_000 },
      {
        fetchFn: vi.fn(async () => ({
          ok: true,
          headers: { get: () => null },
          arrayBuffer: async () =>
            body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
        })) as never,
        readPackage: readPkg(),
        writeFile: (destPath, data) => written.push({ path: destPath, data }),
        unlink,
        tmpDir: () => '/tmp/ok-updates',
        onProgress,
      },
    );
    expect(written).toHaveLength(1);
    expect(written[0].data).toEqual(body);
    expect(result.bytes).toBe(3);
    expect(unlink).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenCalledWith(3, 67_000_000);
  });

  it('throws sha256-mismatch and unlinks (17)', async () => {
    const unlink = vi.fn();
    await expect(
      downloadAndVerify(
        '5.7.1',
        { url: 'https://example.com/OnlyKey.exe', sha256: 'deadbeef', size: 3 },
        {
          fetchFn: vi.fn(async () => binRes(body)) as never,
          readPackage: readPkg(),
          unlink,
          tmpDir: () => '/tmp/ok-updates',
        },
      ),
    ).rejects.toMatchObject({ code: 'sha256-mismatch' });
    expect(unlink).toHaveBeenCalled();
  });

  it('writes the installer and reports progress (18)', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const written: Array<{ path: string; data: Uint8Array }> = [];
    const onProgress = vi.fn();
    const result = await downloadAndVerify(
      '5.7.1',
      { url: 'https://example.com/OnlyKey_5.7.1.exe', sha256: hash, size: 3 },
      {
        fetchFn: vi.fn(async () => binRes(body)) as never,
        readPackage: readPkg(),
        writeFile: (destPath, data) => written.push({ path: destPath, data }),
        tmpDir: () => '/tmp/ok-updates',
        onProgress,
      },
    );
    expect(written).toHaveLength(1);
    expect(written[0].data).toEqual(body);
    expect(result).toMatchObject({ version: '5.7.1', bytes: 3, sha256: hash });
    expect(onProgress).toHaveBeenCalledWith(3, 3);
  });

  it('reports incremental progress while streaming the body', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const onProgress = vi.fn();
    const chunks = [new Uint8Array([9]), new Uint8Array([8, 7])];
    const result = await downloadAndVerify(
      '5.7.1',
      { url: 'https://example.com/OnlyKey_5.7.1.exe', sha256: hash, size: 3 },
      {
        fetchFn: vi.fn(async () => streamBinRes(chunks)) as never,
        readPackage: readPkg(),
        writeFile: () => undefined,
        tmpDir: () => '/tmp/ok-updates',
        onProgress,
      },
    );
    expect(result.bytes).toBe(3);
    const received = onProgress.mock.calls.map((c) => c[0]);
    expect(received).toContain(1);
    expect(received).toContain(3);
    expect(Math.max(...received)).toBe(3);
  });

  it('refuses non-HTTPS and off-prefix package URLs before fetch', async () => {
    await expect(
      downloadAndVerify('5.7.1', { url: 'http://example.com/OnlyKey.exe', sha256: hash }, { readPackage: readPkg() }),
    ).rejects.toMatchObject({ code: 'not-https' });
    await expect(
      downloadAndVerify(
        '5.7.1',
        { url: 'https://evil.example/OnlyKey.exe', sha256: hash },
        { readPackage: readPkg() },
      ),
    ).rejects.toMatchObject({ code: 'host-not-allowed' });
    await expect(
      downloadAndVerify('5.7.1', { url: 'https://example.com/OnlyKey.exe', sha256: '' }, { readPackage: readPkg() }),
    ).rejects.toMatchObject({ code: 'missing-sha256' });
  });

  it('maps fetch, arrayBuffer, and write failures to AppUpdateError', async () => {
    await expect(
      downloadAndVerify(
        '5.7.1',
        { url: 'https://example.com/OnlyKey.exe', sha256: hash, size: 3 },
        {
          fetchFn: vi.fn(async () => {
            throw new Error('reset');
          }) as never,
          readPackage: readPkg(),
        },
      ),
    ).rejects.toMatchObject({ code: 'http-package', message: 'reset' });

    await expect(
      downloadAndVerify(
        '5.7.1',
        { url: 'https://example.com/OnlyKey.exe', sha256: hash, size: 3 },
        {
          fetchFn: vi.fn(async () => ({
            ok: true,
            headers: { get: () => null },
            arrayBuffer: async () => {
              throw new Error('truncated');
            },
          })) as never,
          readPackage: readPkg(),
        },
      ),
    ).rejects.toMatchObject({ code: 'io', message: 'truncated' });

    await expect(
      downloadAndVerify(
        '5.7.1',
        { url: 'https://example.com/OnlyKey.exe', sha256: hash, size: 3 },
        {
          fetchFn: vi.fn(async () => binRes(body)) as never,
          readPackage: readPkg(),
          writeFile: () => {
            throw new Error('disk full');
          },
          unlink: vi.fn(),
          tmpDir: () => '/tmp/ok-updates',
        },
      ),
    ).rejects.toMatchObject({ code: 'io', message: 'disk full' });
  });

  it('writes via fs when writeFile is omitted', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ok-dl-'));
    try {
      const result = await downloadAndVerify(
        '5.7.1',
        { url: 'https://example.com/OnlyKey_5.7.1.exe', sha256: hash, size: 3 },
        {
          fetchFn: vi.fn(async () => binRes(body)) as never,
          readPackage: readPkg(),
          tmpDir: () => dir,
        },
      );
      expect(fs.readFileSync(result.destPath)).toEqual(Buffer.from(body));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('showUpdateInFolder', () => {
  it('reveals the downloaded file in the folder', () => {
    const showInFolder = vi.fn();
    showUpdateInFolder('/tmp/ok-updates/OnlyKey.exe', { showInFolder });
    expect(showInFolder).toHaveBeenCalledWith('/tmp/ok-updates/OnlyKey.exe');
  });
});
