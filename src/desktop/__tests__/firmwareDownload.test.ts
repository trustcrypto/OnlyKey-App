import { afterEach, describe, expect, it, vi } from 'vitest';
import { sha256 } from 'js-sha256';
import { fetchLatestFirmwareRelease } from '../firmwareDownload';

const signedBody = '-----BEGIN SIGNED FIRMWARE-----\naabbccdd\n';

describe('fetchLatestFirmwareRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('verifies the GitHub asset digest before returning blocks', async () => {
    const digest = `sha256:${sha256(signedBody)}`;
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('api.github.com')) {
        return {
          ok: true,
          json: async () => ({
            tag_name: 'v3.0.4',
            assets: [
              {
                name: 'Signed_OnlyKey_3_0_4_STD.txt',
                browser_download_url:
                  'https://github.com/trustcrypto/OnlyKey-Firmware/releases/download/v3.0.4/Signed_OnlyKey_3_0_4_STD.txt',
                digest,
              },
            ],
          }),
        };
      }
      return { ok: true, text: async () => signedBody };
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLatestFirmwareRelease();

    expect(result.version).toBe('v3.0.4');
    expect(result.blocks).toEqual(['aabbccdd']);
    expect(result.sha256).toBe(sha256(signedBody));
  });

  it('throws when the release has no tag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ assets: [] }) }));
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/Could not determine latest firmware/);
  });

  it('throws when the firmware download fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            tag_name: 'v3.0.4',
            assets: [
              {
                name: 'Signed_OnlyKey_3_0_4_STD.txt',
                browser_download_url: 'https://github.com/example/fw.txt',
                digest: 'sha256:abc',
              },
            ],
          }),
        })
        .mockResolvedValueOnce({ ok: false, status: 404 }),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/Firmware download failed \(404\)/);
  });

  it('throws when the GitHub asset has no digest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          tag_name: 'v3.0.4',
          assets: [
            {
              name: 'Signed_OnlyKey_3_0_4_STD.txt',
              browser_download_url: 'https://github.com/example/fw.txt',
            },
          ],
        }),
      }),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/missing a SHA-256 digest/);
  });

  it('throws when the downloaded file is not hex firmware', async () => {
    const html = '<html>not firmware</html>';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            tag_name: 'v3.0.4',
            assets: [
              {
                name: 'Signed_OnlyKey_3_0_4_STD.txt',
                browser_download_url: 'https://github.com/example/fw.txt',
                digest: `sha256:${sha256(html)}`,
              },
            ],
          }),
        })
        .mockResolvedValueOnce({ ok: true, text: async () => html }),
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/Invalid hex/);
  });
});
