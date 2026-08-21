import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChromeHidTransport } from '../ChromeHidTransport';

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
    expect(added).toHaveBeenCalled();

    await t.connect({ vendorId: 0x16c0, productId: 0x0486 });
    const gone = vi.fn();
    t.onDisconnect(gone);
    const removed = hid.onDeviceRemoved.addListener.mock.calls[0][0] as (id: number) => void;
    removed(1);
    expect(gone).toHaveBeenCalled();
  });
});
