import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProductionPackageJson } from '../../scripts/release.mjs';
import {
  DEFAULT_UPDATE_BASE_URL,
  DEFAULT_UPDATE_MANIFEST_URL,
  assertSignedArtifact,
  hashFile,
  inferPlatformFromArtifact,
  mergeFragments,
  parseUpdateManifestArgs,
  platformPackageKey,
  recordReleaseArtifact,
  writeFragment,
} from '../../scripts/update-manifest.mjs';

function makeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ok-upd-man-'));
}

function shaOf(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

const sourcePkg = {
  name: 'OnlyKey',
  productName: 'OnlyKey App',
  version: '5.7.0',
  version_name: '5.7.0',
  description: 'Setup and configure OnlyKey',
  'chromium-args': '--disable-background-timer-throttling',
  window: { inject_js_start: 'desktopInject.js' },
};

describe('release.mjs wiring', () => {
  it('does not hash the unsigned installer; points at update-manifest after signing', () => {
    const src = fs.readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/release.mjs'),
      'utf8',
    );
    expect(src).not.toContain('recordReleaseArtifact');
    expect(src).toContain('npm run update-manifest');
    expect(src).toContain('ONLYKEY_UPDATE_MANIFEST_URL');
    expect(src).toContain('ONLYKEY_UPDATE_BASE_URL');
  });
});

describe('inferPlatformFromArtifact / CLI args', () => {
  it('maps installer extensions to node platforms', () => {
    expect(inferPlatformFromArtifact('OnlyKey_5.7.0.exe')).toBe('win32');
    expect(inferPlatformFromArtifact('OnlyKey_5.7.0.dmg')).toBe('darwin');
    expect(inferPlatformFromArtifact('OnlyKey_5.7.0_amd64.deb')).toBe('linux');
    expect(inferPlatformFromArtifact('OnlyKey.bin')).toBeNull();
  });

  it('parses --artifact and --allow-unsigned', () => {
    expect(parseUpdateManifestArgs(['--artifact', 'a.exe', '--allow-unsigned'])).toMatchObject({
      artifact: 'a.exe',
      allowUnsigned: true,
    });
    expect(() => parseUpdateManifestArgs(['--nope'])).toThrow(/Unknown argument/);
  });
});

describe('platformPackageKey', () => {
  it('maps node and release platform names to win64/mac64/linux64', () => {
    expect(platformPackageKey('win32')).toBe('win64');
    expect(platformPackageKey('windows')).toBe('win64');
    expect(platformPackageKey('darwin')).toBe('mac64');
    expect(platformPackageKey('osx')).toBe('mac64');
    expect(platformPackageKey('linux')).toBe('linux64');
    expect(platformPackageKey('aix')).toBeNull();
  });
});

describe('hashFile / writeFragment / mergeFragments', () => {
  /** @type {string[]} */
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('hashes a fixture buffer into sha256 + size', () => {
    const dir = makeDir();
    dirs.push(dir);
    const body = Buffer.from('onlykey-update-bytes');
    const file = path.join(dir, 'OnlyKey_5.7.0.exe');
    fs.writeFileSync(file, body);
    expect(hashFile(file)).toEqual({ sha256: shaOf(body), size: body.byteLength });
  });

  it('writes a fragment with sha256, size, and a URL under the base', () => {
    const dir = makeDir();
    dirs.push(dir);
    const body = Buffer.from('win-artifact');
    const dest = writeFragment(dir, {
      platformKey: 'win64',
      version: '5.7.0',
      artifactName: 'OnlyKey_5.7.0.exe',
      sha256: shaOf(body),
      size: body.byteLength,
      baseUrl: DEFAULT_UPDATE_BASE_URL,
    });
    const fragment = JSON.parse(fs.readFileSync(dest, 'utf8'));
    expect(fragment).toEqual({
      version: '5.7.0',
      key: 'win64',
      package: {
        url: `${DEFAULT_UPDATE_BASE_URL}/OnlyKey_5.7.0.exe`,
        size: body.byteLength,
        sha256: shaOf(body),
      },
    });
  });

  it('honors ONLYKEY_UPDATE_BASE_URL for package URLs', () => {
    const dir = makeDir();
    dirs.push(dir);
    const sha = shaOf(Buffer.from('x'));
    writeFragment(dir, {
      platformKey: 'linux64',
      version: '5.7.0',
      artifactName: 'OnlyKey_5.7.0_amd64.deb',
      sha256: sha,
      size: 1,
      baseUrl: 'https://s3.amazonaws.com/onlykey-app/releases/5.7-staging/',
    });
    const fragment = JSON.parse(fs.readFileSync(path.join(dir, 'linux64.json'), 'utf8'));
    expect(fragment.package.url).toBe(
      'https://s3.amazonaws.com/onlykey-app/releases/5.7-staging/OnlyKey_5.7.0_amd64.deb',
    );
  });

  it('merges win64+linux64 of the same version and omits mac64', () => {
    const dir = makeDir();
    dirs.push(dir);
    const win = Buffer.from('win');
    const lin = Buffer.from('linux');
    writeFragment(dir, {
      platformKey: 'win64',
      version: '5.7.0',
      artifactName: 'OnlyKey_5.7.0.exe',
      sha256: shaOf(win),
      size: win.byteLength,
      baseUrl: DEFAULT_UPDATE_BASE_URL,
    });
    writeFragment(dir, {
      platformKey: 'linux64',
      version: '5.7.0',
      artifactName: 'OnlyKey_5.7.0_amd64.deb',
      sha256: shaOf(lin),
      size: lin.byteLength,
      baseUrl: DEFAULT_UPDATE_BASE_URL,
    });
    const merged = mergeFragments(dir, { version: '5.7.0', now: '2026-09-11T00:00:00.000Z' });
    expect(Object.keys(merged.packages).sort()).toEqual(['linux64', 'win64']);
    expect(merged.packages.mac64).toBeUndefined();
    expect(merged.packages.win64.sha256).toBe(shaOf(win));
    expect(merged.packages.linux64.sha256).toBe(shaOf(lin));
    expect(merged.version).toBe('5.7.0');
  });

  it('refuses a fragment missing sha256', () => {
    const dir = makeDir();
    dirs.push(dir);
    fs.writeFileSync(
      path.join(dir, 'win64.json'),
      `${JSON.stringify({
        version: '5.7.0',
        key: 'win64',
        package: { url: `${DEFAULT_UPDATE_BASE_URL}/OnlyKey_5.7.0.exe`, size: 1 },
      })}\n`,
    );
    expect(() => mergeFragments(dir, { version: '5.7.0' })).toThrow(/missing sha256/);
  });

  it('refuses a fragment whose sha256 is not 64 hex chars', () => {
    const dir = makeDir();
    dirs.push(dir);
    expect(() =>
      writeFragment(dir, {
        platformKey: 'win64',
        version: '5.7.0',
        artifactName: 'OnlyKey_5.7.0.exe',
        sha256: 'not-a-hash',
        size: 1,
        baseUrl: DEFAULT_UPDATE_BASE_URL,
      }),
    ).toThrow(/64-character/);
  });

  it('drops a fragment whose version does not match the release', () => {
    const dir = makeDir();
    dirs.push(dir);
    const current = Buffer.from('now');
    const stale = Buffer.from('old');
    writeFragment(dir, {
      platformKey: 'win64',
      version: '5.7.0',
      artifactName: 'OnlyKey_5.7.0.exe',
      sha256: shaOf(current),
      size: current.byteLength,
      baseUrl: DEFAULT_UPDATE_BASE_URL,
    });
    writeFragment(dir, {
      platformKey: 'mac64',
      version: '5.6.0',
      artifactName: 'OnlyKey_5.6.0.dmg',
      sha256: shaOf(stale),
      size: stale.byteLength,
      baseUrl: DEFAULT_UPDATE_BASE_URL,
    });
    const merged = mergeFragments(dir, { version: '5.7.0', now: '2026-09-11T00:00:00.000Z' });
    expect(merged.packages.win64).toBeTruthy();
    expect(merged.packages.mac64).toBeUndefined();
  });
});

describe('assertSignedArtifact', () => {
  it('refuses a Windows installer Authenticode reports as NotSigned', () => {
    expect(() =>
      assertSignedArtifact('C:\\signed\\OnlyKey.exe', 'win32', {
        inspectAuthenticode: () => ({ status: 'NotSigned' }),
      }),
    ).toThrow(/unsigned Windows installer/i);
  });

  it('accepts Valid Authenticode', () => {
    expect(
      assertSignedArtifact('C:\\signed\\OnlyKey.exe', 'win32', {
        inspectAuthenticode: () => ({ status: 'Valid', signer: 'CN=CryptoTrust' }),
      }),
    ).toMatchObject({ status: 'Valid' });
  });

  it('skips the check when requireSigned is false', () => {
    expect(assertSignedArtifact('unsigned.exe', 'win32', { requireSigned: false })).toEqual({
      status: 'skipped',
      signer: '',
    });
  });
});

describe('recordReleaseArtifact', () => {
  it('writes fragment + merged manifest and notes a one-platform file', () => {
    const dir = makeDir();
    try {
      const body = Buffer.from('installer');
      const artifact = path.join(dir, 'OnlyKey_5.7.0.exe');
      fs.writeFileSync(artifact, body);
      const lines = [];
      const result = recordReleaseArtifact({
        artifactPath: artifact,
        version: '5.7.0',
        platform: 'win32',
        releasesDir: dir,
        baseUrl: DEFAULT_UPDATE_BASE_URL,
        now: '2026-09-11T00:00:00.000Z',
        requireSigned: false,
        log: { log: (...args) => lines.push(args.join(' ')) },
      });
      expect(result.key).toBe('win64');
      expect(result.sha256).toBe(shaOf(body));
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
      expect(manifest.packages.win64.url).toBe(`${DEFAULT_UPDATE_BASE_URL}/OnlyKey_5.7.0.exe`);
      expect(manifest.packages.win64.sha256).toBe(shaOf(body));
      expect(lines.join('\n')).toMatch(/one-platform manifest is publishable/i);
      expect(lines.join('\n')).toMatch(/does not upload/i);
      expect(lines.join('\n')).toMatch(/signed file/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('hashes a file Authenticode reports Valid and refuses NotSigned', () => {
    const dir = makeDir();
    try {
      const artifact = path.join(dir, 'OnlyKey_5.7.0.exe');
      fs.writeFileSync(artifact, 'signed-bytes');
      const ok = recordReleaseArtifact({
        artifactPath: artifact,
        version: '5.7.0',
        platform: 'win32',
        releasesDir: dir,
        requireSigned: true,
        inspectAuthenticode: () => ({ status: 'Valid', signer: 'CN=CryptoTrust' }),
        log: { log: () => {} },
      });
      expect(ok.signature).toMatchObject({ status: 'Valid' });
      expect(() =>
        recordReleaseArtifact({
          artifactPath: artifact,
          version: '5.7.0',
          platform: 'win32',
          releasesDir: dir,
          requireSigned: true,
          inspectAuthenticode: () => ({ status: 'NotSigned' }),
          log: { log: () => {} },
        }),
      ).toThrow(/unsigned Windows installer/i);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('buildProductionPackageJson', () => {
  const envKeys = ['ONLYKEY_UPDATE_MANIFEST_URL', 'ONLYKEY_UPDATE_BASE_URL'];
  /** @type {Record<string, string | undefined>} */
  const previous = {};

  afterEach(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
      delete previous[key];
    }
  });

  function stashEnv() {
    for (const key of envKeys) {
      previous[key] = process.env[key];
      delete process.env[key];
    }
  }

  it('defaults to repo manifest.json when env is unset', () => {
    stashEnv();
    const pkg = buildProductionPackageJson(sourcePkg);
    expect(pkg.manifestUrl).toBe(DEFAULT_UPDATE_MANIFEST_URL);
    expect(pkg.updateBaseUrl).toBeUndefined();
  });

  it('uses ONLYKEY_UPDATE_MANIFEST_URL over repo manifest.json', () => {
    stashEnv();
    process.env.ONLYKEY_UPDATE_MANIFEST_URL =
      'https://s3.amazonaws.com/onlykey-app/releases/5.7-staging/manifest.json';
    process.env.ONLYKEY_UPDATE_BASE_URL =
      'https://s3.amazonaws.com/onlykey-app/releases/5.7-staging';
    const pkg = buildProductionPackageJson(sourcePkg);
    expect(pkg.manifestUrl).toBe(
      'https://s3.amazonaws.com/onlykey-app/releases/5.7-staging/manifest.json',
    );
    expect(pkg.updateBaseUrl).toBe(
      'https://s3.amazonaws.com/onlykey-app/releases/5.7-staging/',
    );
  });
});
