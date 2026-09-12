import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.unmock('../firmwareCheck');

import { userPreferences } from '../userPreferences';
import {
  FW_API_URL,
  FW_CHECK_SESSION_KEY,
  checkFirmwareUpdate,
  clearPendingFirmware,
  compareFirmwareVersion,
  firmwareVersionTuple,
  getPendingFirmware,
  storePendingFirmware,
  supportsAppFirmwareUpdate,
  type FirmwareUpdateIo,
} from '../firmwareCheck';

const STD = 'Signed_OnlyKey_3_0_4_STD.txt';
const IN_TRVL = 'Signed_OnlyKey_3_0_4_IN_TRVL.txt';

function io(partial: FirmwareUpdateIo = {}): FirmwareUpdateIo {
  return { isDesktop: () => true, ...partial };
}

function jsonRes(
  body: unknown,
  ok = true,
  status = 200,
): { ok: boolean; status: number; url: string; json: () => Promise<unknown> } {
  return {
    ok,
    status,
    url: FW_API_URL,
    json: async () => body,
  };
}

function apiRelease(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v3.0.4-prod',
    assets: [{ name: STD, browser_download_url: `https://github.com/trustcrypto/OnlyKey-Firmware/releases/download/v3.0.4-prod/${STD}` }],
    ...overrides,
  };
}

function fetchRelease(overrides: Record<string, unknown> = {}) {
  return vi.fn(async () => jsonRes(apiRelease(overrides))) as unknown as typeof fetch;
}

describe('supportsAppFirmwareUpdate', () => {
  it('uses length < 10 then the 5.6 index check (12)', () => {
    expect(supportsAppFirmwareUpdate('')).toBe(false);
    expect(supportsAppFirmwareUpdate('v1')).toBe(false);
    expect(supportsAppFirmwareUpdate('v0.2-beta.6')).toBe(false);
    expect(supportsAppFirmwareUpdate('123456789.5')).toBe(false);
    expect(supportsAppFirmwareUpdate('v2.1.2 STD')).toBe(true);
    expect(supportsAppFirmwareUpdate('v3.0.4-prodc')).toBe(true);
    expect(supportsAppFirmwareUpdate('123456789.7')).toBe(true);
    expect(supportsAppFirmwareUpdate('123456789x0')).toBe(true);
  });
});

describe('firmwareVersionTuple / compareFirmwareVersion', () => {
  it('compares numeric X.Y.Z after stripping labels (13)', () => {
    expect(firmwareVersionTuple('v3.0.4-prodc')).toEqual([3, 0, 4]);
    expect(firmwareVersionTuple('v3.0.4-prod')).toEqual([3, 0, 4]);
    expect(firmwareVersionTuple('v3.0.4-prodp')).toEqual([3, 0, 4]);
    expect(firmwareVersionTuple('v3.0.4')).toEqual([3, 0, 4]);
    expect(firmwareVersionTuple('v2.1.2 STD')).toEqual([2, 1, 2]);
    expect(firmwareVersionTuple('v0.2-beta.6')).toEqual([0, 2, 0]);
    expect(compareFirmwareVersion('v3.0.4-prodc', 'v3.0.4-prod')).toBe(0);
    expect(compareFirmwareVersion('v3.0.4-prodp', 'v3.0.4')).toBe(0);
    expect(compareFirmwareVersion('v2.1.2 STD', 'v3.0.4-prod')).toBe(-1);
    expect(compareFirmwareVersion('v3.0.4-prod', 'v3.0.3-prod')).toBe(1);
    expect(compareFirmwareVersion('v0.2-beta.6', 'v3.0.4-prod')).toBe(-1);
  });
});

describe('checkFirmwareUpdate', () => {
  beforeEach(() => {
    sessionStorage.clear();
    userPreferences.autoUpdateFW = true;
    vi.stubGlobal('nw', {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in tests')));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skips when autoUpdateFW is off and force is false (1)', async () => {
    const fetchFn = vi.fn();
    await expect(
      checkFirmwareUpdate(
        'v3.0.4-prodc',
        io({ fetchFn: fetchFn as never, autoUpdateEnabled: () => false }),
      ),
    ).resolves.toEqual({
      kind: 'skipped',
      reason: 'pref-disabled',
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBeNull();
  });

  it('fetches when force is true even if the pref is off (2)', async () => {
    const fetchFn = fetchRelease();
    const result = await checkFirmwareUpdate(
      'v3.0.4-prodc',
      io({ fetchFn, autoUpdateEnabled: () => false }),
      { force: true },
    );
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(result.kind).toBe('current');
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBeNull();
  });

  it('skips when not desktop (3)', async () => {
    const fetchFn = vi.fn();
    await expect(
      checkFirmwareUpdate('v3.0.4-prodc', io({ fetchFn: fetchFn as never, isDesktop: () => false })),
    ).resolves.toEqual({ kind: 'skipped', reason: 'not-desktop' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBeNull();
  });

  it('skips a second auto-check in the same session (4)', async () => {
    sessionStorage.setItem(FW_CHECK_SESSION_KEY, '1');
    const fetchFn = vi.fn();
    await expect(checkFirmwareUpdate('v3.0.4-prodc', io({ fetchFn: fetchFn as never }))).resolves.toEqual({
      kind: 'skipped',
      reason: 'already-checked',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('hits the network on force even with a session key (5)', async () => {
    sessionStorage.setItem(FW_CHECK_SESSION_KEY, '1');
    const fetchFn = fetchRelease();
    const result = await checkFirmwareUpdate('v3.0.4-prodc', io({ fetchFn }), { force: true });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(result.kind).toBe('current');
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBe('1');
  });

  it('treats v3.0.4-prodc vs API v3.0.4-prod as current (6)', async () => {
    const fetchFn = fetchRelease();
    const result = await checkFirmwareUpdate('v3.0.4-prodc', io({ fetchFn }));
    expect(result).toEqual({
      kind: 'current',
      currentVersion: 'v3.0.4-prodc',
      latestVersion: 'v3.0.4-prod',
    });
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBe('1');
    expect(fetchFn).toHaveBeenCalledWith(
      FW_API_URL,
      expect.objectContaining({
        cache: 'no-store',
        redirect: 'follow',
        headers: expect.objectContaining({ Accept: 'application/vnd.github+json' }),
      }),
    );
  });

  it('returns available for v2.1.2 STD vs v3.0.4-prod (7)', async () => {
    const fetchFn = fetchRelease();
    const result = await checkFirmwareUpdate('v2.1.2 STD', io({ fetchFn }));
    expect(result).toEqual({
      kind: 'available',
      currentVersion: 'v2.1.2 STD',
      latestVersion: 'v3.0.4-prod',
      filename: STD,
    });
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBe('1');
  });

  it('returns unsupported for v0.2-beta.6 without fetching (8)', async () => {
    const fetchFn = vi.fn();
    const result = await checkFirmwareUpdate('v0.2-beta.6', io({ fetchFn: fetchFn as never }));
    expect(result).toEqual({
      kind: 'unsupported',
      currentVersion: 'v0.2-beta.6',
      fwUpdateSupport: false,
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBe('1');
  });

  it('fetches for uninitialized empty version and returns available (8b)', async () => {
    const fetchFn = fetchRelease();
    const result = await checkFirmwareUpdate('', io({ fetchFn }), { isInitialized: false });
    expect(result).toEqual({
      kind: 'available',
      currentVersion: '',
      latestVersion: 'v3.0.4-prod',
      filename: STD,
    });
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBe('1');
  });

  it('returns unavailable http-release on API 503 and sets the session key (9)', async () => {
    const fetchFn = vi.fn(async () => jsonRes({}, false, 503)) as unknown as typeof fetch;
    const result = await checkFirmwareUpdate('v3.0.4-prodc', io({ fetchFn }));
    expect(result).toEqual({
      kind: 'unavailable',
      code: 'http-release',
      currentVersion: 'v3.0.4-prodc',
    });
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBe('1');
  });

  it('returns unavailable http-release when fetch throws (9b)', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const result = await checkFirmwareUpdate('v2.1.2 STD', io({ fetchFn }));
    expect(result).toEqual({
      kind: 'unavailable',
      code: 'http-release',
      currentVersion: 'v2.1.2 STD',
    });
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBe('1');
  });

  it('returns unavailable invalid-release when tag_name is missing (10)', async () => {
    const fetchFn = vi.fn(async () => jsonRes({ assets: [{ name: STD }] })) as unknown as typeof fetch;
    const result = await checkFirmwareUpdate('v2.1.2 STD', io({ fetchFn }));
    expect(result).toEqual({
      kind: 'unavailable',
      code: 'invalid-release',
      currentVersion: 'v2.1.2 STD',
    });
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBe('1');
  });

  it('returns unavailable missing-std-asset when only IN_TRVL is published (10b)', async () => {
    const fetchFn = fetchRelease({
      assets: [{ name: IN_TRVL, browser_download_url: 'https://github.com/trustcrypto/OnlyKey-Firmware/releases/download/v3.0.4-prod/' + IN_TRVL }],
    });
    const result = await checkFirmwareUpdate('v2.1.2 STD', io({ fetchFn }));
    expect(result).toEqual({
      kind: 'unavailable',
      code: 'missing-std-asset',
      currentVersion: 'v2.1.2 STD',
    });
    expect(result.kind).not.toBe('available');
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBe('1');
  });

  it('does not write the session key on skipped unsafe-state or pref-disabled (10c)', async () => {
    const fetchFn = vi.fn();
    await expect(
      checkFirmwareUpdate('v3.0.4-prodc', io({ fetchFn: fetchFn as never }), { isBootloader: true }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'unsafe-state' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBeNull();

    await expect(
      checkFirmwareUpdate(
        'v3.0.4-prodc',
        io({ fetchFn: fetchFn as never, autoUpdateEnabled: () => false }),
      ),
    ).resolves.toEqual({
      kind: 'skipped',
      reason: 'pref-disabled',
    });
    expect(sessionStorage.getItem(FW_CHECK_SESSION_KEY)).toBeNull();
  });
});

describe('pending firmware helpers', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stores and clears pending firmware blocks (11)', () => {
    expect(getPendingFirmware()).toBeNull();
    storePendingFirmware(['aa', 'bb']);
    expect(getPendingFirmware()).toEqual(['aa', 'bb']);
    clearPendingFirmware();
    expect(getPendingFirmware()).toBeNull();
  });

  it('returns null for corrupt pending firmware JSON (11)', () => {
    sessionStorage.setItem('ok-pending-firmware', '{not-json');
    expect(getPendingFirmware()).toBeNull();
  });
});
