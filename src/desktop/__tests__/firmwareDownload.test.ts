import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from 'js-sha256';
import {
  buildFirmwareFilename,
  fetchLatestFirmwareRelease,
  parseFirmwareChecksumFromReleaseBody,
} from '../firmwareDownload';

const signedBody = '-----BEGIN SIGNED FIRMWARE-----\naabbccdd\n';
const signedBytes = new TextEncoder().encode(signedBody);
const signedHash = sha256(signedBytes);

const STD = 'Signed_OnlyKey_3_0_4_STD.txt';
const HTTPS = `https://github.com/trustcrypto/OnlyKey-Firmware/releases/download/v3.0.4-prod/${STD}`;

function apiRelease(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v3.0.4-prod',
    body: `**SHA 256 checksums**\r\n\r\n${STD}\r\n${signedHash}\r\n\r\nSigned_OnlyKey_3_0_4_IN_TRVL.txt\r\n${'a'.repeat(64)}\r\n`,
    assets: [
      {
        name: STD,
        browser_download_url: HTTPS,
        digest: null,
      },
    ],
    ...overrides,
  };
}

function jsonRes(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function binRes(bytes: Uint8Array, ok = true, status = 200) {
  return {
    ok,
    status,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

describe('buildFirmwareFilename', () => {
  it('maps dotted and -prod tags to the STD signed txt name', () => {
    expect(buildFirmwareFilename('v3.0.4')).toBe(STD);
    expect(buildFirmwareFilename('v3.0.4-prod')).toBe(STD);
    expect(buildFirmwareFilename('3.0.4')).toBe(STD);
  });
});

describe('parseFirmwareChecksumFromReleaseBody', () => {
  it('reads the 64-hex line after the matching filename (live GitHub layout)', () => {
    const body = apiRelease().body as string;
    expect(parseFirmwareChecksumFromReleaseBody(body, STD)).toBe(signedHash);
    expect(parseFirmwareChecksumFromReleaseBody(body, 'Signed_OnlyKey_3_0_4_IN_TRVL.txt')).toBe(
      'a'.repeat(64),
    );
  });

  it('accepts filename and hash on the same line', () => {
    expect(parseFirmwareChecksumFromReleaseBody(`${STD}  ${signedHash}`, STD)).toBe(signedHash);
  });

  it('returns null when body/filename/hash is missing', () => {
    expect(parseFirmwareChecksumFromReleaseBody(undefined, STD)).toBeNull();
    expect(parseFirmwareChecksumFromReleaseBody('', STD)).toBeNull();
    expect(parseFirmwareChecksumFromReleaseBody('no hashes here', STD)).toBeNull();
    expect(parseFirmwareChecksumFromReleaseBody(`${STD}\nnot-a-hash`, STD)).toBeNull();
  });
});

describe('fetchLatestFirmwareRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('verifies the GitHub asset digest against raw file bytes', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('api.github.com')) {
        return jsonRes(
          apiRelease({
            tag_name: 'v3.0.4',
            body: '',
            assets: [{ name: STD, browser_download_url: HTTPS, digest: `sha256:${signedHash}` }],
          }),
        );
      }
      return binRes(signedBytes);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLatestFirmwareRelease();

    expect(result.version).toBe('v3.0.4');
    expect(result.blocks).toEqual(['aabbccdd']);
    expect(result.sha256).toBe(signedHash);
    expect(result.downloadUrl).toBe(HTTPS);
  });

  it('uses the release-body checksum when asset.digest is null (live v3.0.4-prod)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('api.github.com')) return jsonRes(apiRelease());
      return binRes(signedBytes);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLatestFirmwareRelease();

    expect(result.version).toBe('v3.0.4-prod');
    expect(result.blocks).toEqual(['aabbccdd']);
    expect(result.sha256).toBe(signedHash);
  });

  it('prefers a valid asset.digest over a conflicting body checksum', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('api.github.com')) {
        return jsonRes(
          apiRelease({
            body: `${STD}\n${'b'.repeat(64)}`,
            assets: [{ name: STD, browser_download_url: HTTPS, digest: `SHA256:${signedHash}` }],
          }),
        );
      }
      return binRes(signedBytes);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLatestFirmwareRelease();
    expect(result.sha256).toBe(signedHash);
  });

  it('throws when the release has no tag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({ assets: [] })));
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/Could not determine latest firmware/);
  });

  it('throws when the GitHub API lookup fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({}, false, 503)));
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/Firmware release lookup failed \(503\)/);
  });

  it('throws when the firmware download fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonRes(
            apiRelease({
              assets: [{ name: STD, browser_download_url: HTTPS, digest: `sha256:${signedHash}` }],
            }),
          ),
        )
        .mockResolvedValueOnce(binRes(signedBytes, false, 404)),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/Firmware download failed \(404\)/);
  });

  it('throws when digest is null and the release body has no checksum', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonRes({
          tag_name: 'v3.0.4',
          body: 'no checksums',
          assets: [{ name: STD, browser_download_url: HTTPS, digest: null }],
        }),
      ),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/missing a SHA-256 digest/);
  });

  it('throws when the downloaded bytes do not match the digest', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonRes(
            apiRelease({
              body: '',
              assets: [{ name: STD, browser_download_url: HTTPS, digest: `sha256:${'c'.repeat(64)}` }],
            }),
          ),
        )
        .mockResolvedValueOnce(binRes(signedBytes)),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/does not match/);
  });

  it('throws when the body checksum does not match the downloaded bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonRes(
            apiRelease({
              body: `${STD}\n${'d'.repeat(64)}`,
              assets: [{ name: STD, browser_download_url: HTTPS, digest: null }],
            }),
          ),
        )
        .mockResolvedValueOnce(binRes(signedBytes)),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/does not match/);
  });

  it('throws when the asset URL is not HTTPS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonRes(
          apiRelease({
            assets: [{ name: STD, browser_download_url: 'http://evil.example/fw.txt', digest: signedHash }],
          }),
        ),
      ),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/missing HTTPS asset/);
  });

  it('throws when the asset list does not include the STD file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonRes(apiRelease({ assets: [] }))),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/missing HTTPS asset/);
  });

  it('throws when the downloaded file is not hex firmware', async () => {
    const html = new TextEncoder().encode('<html>not firmware</html>');
    const hash = sha256(html);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonRes(
            apiRelease({
              body: '',
              assets: [{ name: STD, browser_download_url: HTTPS, digest: `sha256:${hash}` }],
            }),
          ),
        )
        .mockResolvedValueOnce(binRes(html)),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/Invalid hex/);
  });

  it('throws when the signed file has no firmware blocks', async () => {
    const emptySigned = new TextEncoder().encode('-----BEGIN SIGNED FIRMWARE-----\n\n');
    const hash = sha256(emptySigned);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonRes(
            apiRelease({
              body: '',
              assets: [{ name: STD, browser_download_url: HTTPS, digest: `sha256:${hash}` }],
            }),
          ),
        )
        .mockResolvedValueOnce(binRes(emptySigned)),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/could not be parsed/);
  });
});
