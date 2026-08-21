import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from 'js-sha256';
import { userPreferences } from '../userPreferences';
import {
  checkForAppUpdate,
  compareSemver,
  isHttpsUrl,
  normalizeSha256,
  verifySha256,
} from '../updater';

describe('updater helpers', () => {
  it('compares semver', () => {
    expect(compareSemver('5.7.1', '5.7.0')).toBe(1);
    expect(compareSemver('5.7.0', '5.7.0')).toBe(0);
    expect(compareSemver('5.6.9', '5.7.0')).toBe(-1);
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
});

describe('checkForAppUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('nw', { App: { startPath: '/tmp' }, Shell: { showItemInFolder: vi.fn() } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when autoUpdate is off', async () => {
    const fetchFn = vi.fn();
    await checkForAppUpdate({ fetchFn: fetchFn as never });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('refuses a non-HTTPS manifest', async () => {
    userPreferences.autoUpdate = true;
    await expect(
      checkForAppUpdate({
        readPackage: () => ({ version: '5.7.0', manifestUrl: 'http://evil.example/manifest.json' }),
      }),
    ).rejects.toThrow(/non-HTTPS/);
  });

  it('downloads only after sha256 and size match', async () => {
    userPreferences.autoUpdate = true;
    const body = new Uint8Array([9, 8, 7]);
    const hash = sha256(body);
    const written: Array<{ path: string; data: Uint8Array }> = [];
    const showInFolder = vi.fn();
    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).includes('manifest')) {
        return {
          ok: true,
          json: async () => ({
            version: '5.7.1',
            packages: {
              win64: { url: 'https://example.com/OnlyKey_5.7.1.exe', size: 3, sha256: hash },
              mac64: { url: 'https://example.com/OnlyKey_5.7.1.dmg', size: 3, sha256: hash },
              linux64: { url: 'https://example.com/OnlyKey_5.7.1.deb', size: 3, sha256: hash },
            },
          }),
        };
      }
      return { ok: true, arrayBuffer: async () => body.buffer };
    });

    await checkForAppUpdate({
      fetchFn: fetchFn as never,
      confirmFn: () => true,
      readPackage: () => ({ version: '5.7.0', manifestUrl: 'https://example.com/manifest.json' }),
      writeFile: (destPath, data) => written.push({ path: destPath, data }),
      tmpDir: () => '/tmp/ok-updates',
      showInFolder,
    });

    expect(written).toHaveLength(1);
    expect(written[0].data).toEqual(body);
    expect(showInFolder).toHaveBeenCalledOnce();
  });

  it('rejects a package with no sha256', async () => {
    userPreferences.autoUpdate = true;
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        version: '5.7.1',
        packages: {
          win64: { url: 'https://example.com/OnlyKey.exe' },
          mac64: { url: 'https://example.com/OnlyKey.dmg' },
          linux64: { url: 'https://example.com/OnlyKey.deb' },
        },
      }),
    }));

    await expect(
      checkForAppUpdate({
        fetchFn: fetchFn as never,
        confirmFn: () => true,
        readPackage: () => ({ version: '5.7.0', manifestUrl: 'https://example.com/manifest.json' }),
      }),
    ).rejects.toThrow(/missing sha256/);
  });

  it('skips download when the user declines or versions are equal', async () => {
    userPreferences.autoUpdate = true;
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ version: '5.7.0', packages: {} }),
    }));
    await checkForAppUpdate({
      fetchFn: fetchFn as never,
      confirmFn: () => false,
      readPackage: () => ({ version: '5.7.0', manifestUrl: 'https://example.com/manifest.json' }),
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    fetchFn.mockResolvedValue({
      ok: true,
      json: async () => ({ version: '5.7.1', packages: {} }),
    } as never);
    await checkForAppUpdate({
      fetchFn: fetchFn as never,
      confirmFn: () => false,
      readPackage: () => ({ version: '5.7.0', manifestUrl: 'https://example.com/manifest.json' }),
    });
  });

  it('rejects a failed package download and a size mismatch', async () => {
    userPreferences.autoUpdate = true;
    const body = new Uint8Array([1, 2]);
    const hash = sha256(body);
    const pkg = {
      url: 'https://example.com/OnlyKey.exe',
      sha256: hash,
      size: 99,
    };
    const manifest = {
      version: '5.7.1',
      packages: { win64: pkg, mac64: pkg, linux64: pkg },
    };

    await expect(
      checkForAppUpdate({
        fetchFn: vi
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => manifest })
          .mockResolvedValueOnce({ ok: false, status: 502 }) as never,
        confirmFn: () => true,
        readPackage: () => ({ version: '5.7.0', manifestUrl: 'https://example.com/manifest.json' }),
      }),
    ).rejects.toThrow(/Update download failed: HTTP 502/);

    await expect(
      checkForAppUpdate({
        fetchFn: vi
          .fn()
          .mockResolvedValueOnce({ ok: true, json: async () => manifest })
          .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => body.buffer }) as never,
        confirmFn: () => true,
        readPackage: () => ({ version: '5.7.0', manifestUrl: 'https://example.com/manifest.json' }),
      }),
    ).rejects.toThrow(/size does not match/);
  });

  it('rejects a missing HTTPS package URL and a failed manifest fetch', async () => {
    userPreferences.autoUpdate = true;
    await expect(
      checkForAppUpdate({
        fetchFn: vi.fn().mockResolvedValue({ ok: false, status: 404 }) as never,
        readPackage: () => ({ version: '5.7.0', manifestUrl: 'https://example.com/manifest.json' }),
      }),
    ).rejects.toThrow(/Manifest fetch failed/);

    await expect(
      checkForAppUpdate({
        fetchFn: vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ version: '5.7.1', packages: {} }),
        }) as never,
        confirmFn: () => true,
        readPackage: () => ({ version: '5.7.0', manifestUrl: 'https://example.com/manifest.json' }),
      }),
    ).rejects.toThrow(/No HTTPS package URL/);
  });
});
