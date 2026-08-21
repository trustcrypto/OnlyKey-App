import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChromeHidTransport,
  HID_CONNECT_TIMEOUT_MS,
  HID_RECONNECT_GRACE_MS,
  HID_SEND_TIMEOUT_MS,
} from '../ChromeHidTransport';

type HidDevice = {
  deviceId: number;
  vendorId: number;
  productId: number;
  productName: string;
  serialNumber: string;
  collections: Array<{ usagePage: number }>;
};

function hidDevice(partial: Partial<HidDevice> = {}): HidDevice {
  return {
    deviceId: 1,
    vendorId: 0x16c0,
    productId: 0x0486,
    productName: 'OnlyKey',
    serialNumber: 'other',
    collections: [{ usagePage: 0xff00 }],
    ...partial,
  };
}

type HidMock = {
  getDevices: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  receive: ReturnType<typeof vi.fn>;
  onDeviceAdded: { addListener: ReturnType<typeof vi.fn> };
  onDeviceRemoved: { addListener: ReturnType<typeof vi.fn> };
};

describe('ChromeHidTransport', () => {
  let devices: HidDevice[];
  let lastError: string | undefined;
  let receiveCb: ((reportId: number, data: ArrayBuffer) => void) | null;
  let hid: HidMock;

  beforeEach(() => {
    devices = [];
    lastError = undefined;
    receiveCb = null;
    hid = {
      getDevices: vi.fn((_opts: unknown, cb: (devs: HidDevice[]) => void) => {
        if (lastError) {
          (chrome.runtime as { lastError?: { message: string } }).lastError = { message: lastError };
        } else {
          (chrome.runtime as { lastError?: { message: string } }).lastError = undefined;
        }
        cb(devices);
      }),
      connect: vi.fn((_id: number, cb: (info: { connectionId: number } | undefined) => void) => {
        cb({ connectionId: 7 });
      }),
      disconnect: vi.fn((_id: number, cb: () => void) => cb()),
      send: vi.fn((_cid: number, _rid: number, _data: ArrayBuffer, cb: () => void) => cb()),
      receive: vi.fn((_cid: number, cb: (reportId: number, data: ArrayBuffer) => void) => {
        receiveCb = cb;
      }),
      onDeviceAdded: { addListener: vi.fn() },
      onDeviceRemoved: { addListener: vi.fn() },
    };
    vi.stubGlobal('chrome', {
      hid,
      runtime: { lastError: undefined as { message: string } | undefined },
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('isAvailable follows chrome.hid.getDevices', () => {
    expect(ChromeHidTransport.isAvailable()).toBe(true);
    vi.stubGlobal('chrome', undefined);
    expect(ChromeHidTransport.isAvailable()).toBe(false);
  });

  it('listPermittedDevices returns hid devices', async () => {
    devices = [hidDevice()];
    const list = await ChromeHidTransport.listPermittedDevices();
    expect(list).toHaveLength(1);
  });

  it('connects to a matching device and sends reports', async () => {
    devices = [hidDevice()];
    const t = new ChromeHidTransport();
    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    expect(t.getConnectedDevice()).toEqual({ vendorId: 0x16c0, productId: 0x0486 });
    await t.send(0, new Uint8Array(64));
    const received: Uint8Array[] = [];
    t.onReceive((data) => received.push(data));
    receiveCb?.(0, new Uint8Array([1, 2, 3]).buffer);
    expect(received[0][0]).toBe(1);
    await t.disconnect();
  });

  it('throws Device not found when nothing matches', async () => {
    const t = new ChromeHidTransport();
    await expect(t.connect({ vendorId: 1, productId: 2 })).rejects.toThrow(/Device not found/);
  });

  it('throws when HID is unavailable', async () => {
    vi.stubGlobal('chrome', undefined);
    const t = new ChromeHidTransport();
    await expect(t.connect({ vendorId: 1, productId: 2 })).rejects.toThrow(/HID API unavailable/);
  });

  it('notifies onDeviceAdded and onDisconnect', async () => {
    devices = [hidDevice()];
    const t = new ChromeHidTransport();
    const added = vi.fn();
    t.onDeviceAdded(added);
    const addedListener = hid.onDeviceAdded.addListener.mock.calls[0][0] as (d: HidDevice) => void;
    addedListener(hidDevice());
    expect(added).toHaveBeenCalledTimes(1);

    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    addedListener(hidDevice({ deviceId: 2 }));
    expect(added).toHaveBeenCalledTimes(2);
    const gone = vi.fn();
    t.onDisconnect(gone);
    const removed = hid.onDeviceRemoved.addListener.mock.calls[0][0] as (id: number) => void;
    removed(1);
    expect(gone).toHaveBeenCalled();
  });

  it('selects a bootloader PID and a Beta8 usage-page device', async () => {
    devices = [
      hidDevice({
        productId: 0xb001,
        serialNumber: '1000000000',
        collections: [{ usagePage: 0xffab }],
      }),
    ];
    const boot = new ChromeHidTransport();
    await boot.connect({ vendorId: 0x16c0, productId: 0xb001 });
    expect(boot.getConnectedDevice()?.productId).toBe(0xb001);

    devices = [
      hidDevice({
        serialNumber: '1000000000',
        collections: [{ usagePage: 0xffab }],
      }),
    ];
    const beta = new ChromeHidTransport();
    await beta.connect({ vendorId: 0x16c0, productId: 0x0486 });
    expect(beta.getConnectedDevice()).toEqual({ vendorId: 0x16c0, productId: 0x0486 });
  });

  it('falls back to the first matching HID interface', async () => {
    devices = [hidDevice({ serialNumber: '1000000000', collections: [{ usagePage: 0x1 }] })];
    const t = new ChromeHidTransport();
    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    expect(t.getConnectedDevice()?.productId).toBe(0x0486);
  });

  it('sends only the view window of a sliced Uint8Array', async () => {
    devices = [hidDevice()];
    const t = new ChromeHidTransport();
    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    const raw = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    await t.send(0, raw.subarray(2, 6));
    const sent = hid.send.mock.calls[0][2] as ArrayBuffer;
    expect(sent.byteLength).toBe(4);
    expect([...new Uint8Array(sent)]).toEqual([2, 3, 4, 5]);
  });

  it('throws when sending while disconnected', async () => {
    const t = new ChromeHidTransport();
    await expect(t.send(0, new Uint8Array(8))).rejects.toThrow(/Not connected/);
  });

  it('disconnects on send lastError mentioning the device is gone', async () => {
    vi.useFakeTimers();
    devices = [hidDevice()];
    const t = new ChromeHidTransport();
    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    await vi.advanceTimersByTimeAsync(HID_RECONNECT_GRACE_MS);
    const gone = vi.fn();
    t.onDisconnect(gone);
    hid.send.mockImplementation((_c, _r, _d, cb: () => void) => {
      (chrome.runtime as { lastError?: { message: string } }).lastError = {
        message: 'failed: device disconnected',
      };
      cb();
    });
    await expect(t.send(0, new Uint8Array(8))).rejects.toThrow(/disconnected/);
    expect(gone).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('rejects chrome.hid.connect errors and missing connectInfo', async () => {
    devices = [hidDevice()];
    hid.connect.mockImplementation((_id: number, cb: (info?: { connectionId: number }) => void) => {
      (chrome.runtime as { lastError?: { message: string } }).lastError = { message: 'busy' };
      cb(undefined);
    });
    const t = new ChromeHidTransport();
    await expect(t.connect({ vendorId: 0x16c0, productId: 0x0486 })).rejects.toThrow(/busy/);

    (chrome.runtime as { lastError?: { message: string } }).lastError = undefined;
    hid.connect.mockImplementation((_id: number, cb: (info?: { connectionId: number }) => void) => {
      cb(undefined);
    });
    const t2 = new ChromeHidTransport();
    await expect(t2.connect({ vendorId: 0x16c0, productId: 0x0486 })).rejects.toThrow(/Connection failed/);
  });

  it('rejects chrome.hid.connect if the device is yanked before the callback', async () => {
    devices = [hidDevice()];
    let hidConnectCb: ((info: { connectionId: number } | undefined) => void) | undefined;
    hid.connect.mockImplementation((_id: number, cb: (info: { connectionId: number } | undefined) => void) => {
      hidConnectCb = cb;
    });
    const t = new ChromeHidTransport();
    const pending = t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    await vi.waitFor(() => expect(hidConnectCb).toBeTypeOf('function'));
    const removed = hid.onDeviceRemoved.addListener.mock.calls[0][0] as (id: number) => void;
    removed(1);
    hidConnectCb?.({ connectionId: 99 });
    await expect(pending).rejects.toThrow(/disconnected/i);
    expect(t.getConnectedDevice()).toBeNull();
    expect(hid.disconnect).toHaveBeenCalled();
  });

  it('times out a hung chrome.hid.connect so later plugs can connect', async () => {
    vi.useFakeTimers();
    devices = [hidDevice()];
    hid.connect.mockImplementation(() => {
      /* never callback */
    });
    const t = new ChromeHidTransport();
    const pending = t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    const assertion = expect(pending).rejects.toThrow(/disconnected/i);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(HID_CONNECT_TIMEOUT_MS);
    await assertion;
    expect(t.getConnectedDevice()).toBeNull();
    vi.useRealTimers();
  });

  it('ignores a stale receive disconnect after a new connection is open', async () => {
    devices = [hidDevice()];
    const receiveCbs: Array<(reportId: number, data: ArrayBuffer) => void> = [];
    hid.receive.mockImplementation((_cid: number, cb: (reportId: number, data: ArrayBuffer) => void) => {
      receiveCbs.push(cb);
    });
    hid.connect
      .mockImplementationOnce((_id: number, cb: (info: { connectionId: number }) => void) => {
        cb({ connectionId: 7 });
      })
      .mockImplementationOnce((_id: number, cb: (info: { connectionId: number }) => void) => {
        cb({ connectionId: 8 });
      });

    const t = new ChromeHidTransport();
    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    const stale = receiveCbs[0];
    expect(stale).toBeTypeOf('function');

    await t.disconnect();
    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    const gone = vi.fn();
    t.onDisconnect(gone);
    const received: Uint8Array[] = [];
    t.onReceive((data) => received.push(data));

    (chrome.runtime as { lastError?: { message: string } }).lastError = {
      message: 'device disconnected',
    };
    stale?.(0, new ArrayBuffer(0));
    expect(gone).not.toHaveBeenCalled();
    expect(t.getConnectedDevice()?.productId).toBe(0x0486);

    (chrome.runtime as { lastError?: { message: string } }).lastError = undefined;
    const live = receiveCbs[receiveCbs.length - 1];
    live?.(0, new Uint8Array([9, 8, 7]).buffer);
    expect(received[0][0]).toBe(9);
    await t.disconnect();
  });

  it('retries receive errors and disconnects when the device is gone', async () => {
    devices = [hidDevice()];
    vi.useFakeTimers();
    const t = new ChromeHidTransport();
    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    const gone = vi.fn();
    t.onDisconnect(gone);

    receiveCb?.(0, new ArrayBuffer(0));
    (chrome.runtime as { lastError?: { message: string } }).lastError = { message: 'temporary glitch' };
    receiveCb?.(0, new ArrayBuffer(0));
    await vi.advanceTimersByTimeAsync(100);

    (chrome.runtime as { lastError?: { message: string } }).lastError = {
      message: 'invalid connection id',
    };
    receiveCb?.(0, new ArrayBuffer(0));
    expect(gone).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(HID_RECONNECT_GRACE_MS);
    receiveCb?.(0, new ArrayBuffer(0));
    expect(gone).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('retries receive disconnected errors during the reconnect grace window', async () => {
    devices = [hidDevice()];
    vi.useFakeTimers();
    const t = new ChromeHidTransport();
    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    const gone = vi.fn();
    t.onDisconnect(gone);
    (chrome.runtime as { lastError?: { message: string } }).lastError = {
      message: 'device disconnected',
    };
    receiveCb?.(0, new ArrayBuffer(0));
    expect(gone).not.toHaveBeenCalled();
    expect(t.getConnectedDevice()?.productId).toBe(0x0486);
    vi.useRealTimers();
    await t.disconnect();
  });

  it('returns no permitted devices when HID is unavailable', async () => {
    vi.stubGlobal('chrome', undefined);
    expect(await ChromeHidTransport.listPermittedDevices()).toEqual([]);
  });

  it('falls back to an unfiltered getDevices list after a filtered error', async () => {
    hid.getDevices.mockImplementation((opts: { filters?: unknown[] }, cb: (devs: HidDevice[]) => void) => {
      if (opts?.filters?.length) {
        (chrome.runtime as { lastError?: { message: string } }).lastError = { message: 'filtered failed' };
        cb([]);
        return;
      }
      (chrome.runtime as { lastError?: { message: string } }).lastError = undefined;
      cb([hidDevice()]);
    });
    const t = new ChromeHidTransport();
    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    expect(t.getConnectedDevice()?.productId).toBe(0x0486);
  });

  it('rejects a hung chrome.hid.connect immediately when the device is yanked', async () => {
    devices = [hidDevice()];
    hid.connect.mockImplementation(() => {
      /* never callback */
    });
    const t = new ChromeHidTransport();
    const pending = t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    await vi.waitFor(() => expect(hid.connect).toHaveBeenCalled());
    const removed = hid.onDeviceRemoved.addListener.mock.calls[0][0] as (id: number) => void;
    removed(1);
    await expect(pending).rejects.toThrow(/disconnected/i);
    expect(t.getConnectedDevice()).toBeNull();
  });

  it('times out a hung chrome.hid.send so a later plug is not blocked', async () => {
    vi.useFakeTimers();
    devices = [hidDevice()];
    hid.send.mockImplementation(() => {
      /* never callback */
    });
    const t = new ChromeHidTransport();
    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    const pending = t.send(0, new Uint8Array(8));
    const assertion = expect(pending).rejects.toThrow(/disconnected/i);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(HID_SEND_TIMEOUT_MS);
    await assertion;
    vi.useRealTimers();
  });
});
