import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLatestFirmwareRelease } from '../firmwareDownload';

describe('fetchLatestFirmwareRelease', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows the GitHub latest tag and downloads signed firmware', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        url: 'https://github.com/trustcrypto/OnlyKey-Firmware/releases/tag/v3.0.4',
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '-----BEGIN SIGNED FIRMWARE-----\nblock-one\nblock-two\n',
      });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchLatestFirmwareRelease();

    expect(result.version).toBe('v3.0.4');
    expect(result.blocks).toEqual(['block-one', 'block-two']);
    expect(result.downloadUrl).toContain('Signed_OnlyKey_3_0_4_STD.txt');
  });

  it('throws when the latest release URL has no tag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ url: 'https://github.com/' }));
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/Could not determine latest firmware/);
  });

  it('throws when the firmware download fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          url: 'https://github.com/trustcrypto/OnlyKey-Firmware/releases/tag/v3.0.4',
        })
        .mockResolvedValueOnce({ ok: false, status: 404 })
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/Firmware download failed \(404\)/);
  });

  it('throws when the downloaded file is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          url: 'https://github.com/trustcrypto/OnlyKey-Firmware/releases/tag/v3.0.4',
        })
        .mockResolvedValueOnce({ ok: true, text: async () => '-- nothing\n' })
    );
    await expect(fetchLatestFirmwareRelease()).rejects.toThrow(/could not be parsed/);
  });
});
