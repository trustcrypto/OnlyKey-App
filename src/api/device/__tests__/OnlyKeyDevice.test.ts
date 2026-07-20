import { describe, it, expect, vi } from 'vitest';
import { OnlyKeyDevice } from '../OnlyKeyDevice';
import { MockTransport } from '../../transport/MockTransport';
import { MessageID, DeviceType, FieldID, GLOBAL_SLOT } from '../types';

describe('OnlyKeyDevice', () => {
  it('should construct valid HID packets with headers', async () => {
    const transport = new MockTransport();
    const sendSpy = vi.spyOn(transport, 'send');
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0, productId: 0 }); // Trigger initial time sync
    
    // Check first time sync packet
    const lastPacket = sendSpy.mock.calls[0][1];
    expect(lastPacket.slice(0, 4)).toEqual(new Uint8Array([255, 255, 255, 255]));
    expect(lastPacket[4]).toBe(MessageID.OKSETTIME);
  });

  it('should correctly format PIN characters for OnlyKey DUO', async () => {
    const transport = new MockTransport();
    const sendSpy = vi.spyOn(transport, 'send');
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0, productId: 0 }); // MUST connect first
    sendSpy.mockClear(); // Clear initial time sync calls
    
    await device.setPin('1234');
    
    const pinPacket = sendSpy.mock.calls[0][1];
    expect(pinPacket[4]).toBe(MessageID.OKSETPIN);
    expect(pinPacket[5]).toBe(49);
    expect(pinPacket[6]).toBe(50);
  });

  it('keeps Classic device type after later DUO-looking unlock status', async () => {
    const transport = new MockTransport();
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0x1d50, productId: 0x60fc });
    device.state.deviceType = DeviceType.CLASSIC;

    (transport as any).simulateResponse('UNLOCKEDv3.0.0-prod');
    expect(device.state.deviceType).toBe(DeviceType.CLASSIC);
    expect(device.state.isLocked).toBe(false);
  });

  it('does not promote Classic to DUO when label stream includes high slots', async () => {
    const transport = new MockTransport();
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
    device.state.deviceType = DeviceType.CLASSIC;
    device.state.labels.set(13, 'extra');

    device['inferDeviceTypeFromLabels'](true);
    expect(device.state.deviceType).toBe(DeviceType.CLASSIC);
  });

  it('corrects mistaken DUO to Classic when label stream ends at slot 12', async () => {
    const transport = new MockTransport();
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0x1d50, productId: 0x60fc });
    device.state.deviceType = DeviceType.DUO;
    device.state.deviceTypeSource = 'status';

    for (let slot = 1; slot <= 12; slot += 1) {
      device.state.labels.set(slot, `slot${slot}`);
    }

    expect(device['inferDeviceTypeFromLabels'](true)).toBe(true);
    expect(device.state.deviceType).toBe(DeviceType.CLASSIC);
    expect(device.state.deviceTypeSource).toBe('labels:classic-stream');
  });

  it('does not downgrade DUO to Classic on later status messages', async () => {
    const transport = new MockTransport();
    (transport as any).deviceType = 'duo';
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0x1d50, productId: 0x614c });
    expect(device.state.deviceType).toBe(DeviceType.DUO);

    (transport as any).simulateResponse('INITIALIZEDv2.1.0-prod');
    expect(device.state.deviceType).toBe(DeviceType.DUO);
  });

  it(
    'wipes legacy Yubikey auth without waiting for confirmation text',
    async () => {
      const transport = new MockTransport();
      const device = new OnlyKeyDevice(transport);

      await device.connect({ vendorId: 0, productId: 0 });

      const sendSpy = vi.spyOn(transport, 'send').mockResolvedValue(undefined);
      sendSpy.mockClear();

      await expect(device.wipeYubiAuth()).resolves.toBeUndefined();

      const wipePacket = sendSpy.mock.calls[0][1];
      expect(wipePacket[4]).toBe(MessageID.OKWIPESLOT);
      expect(wipePacket[5]).toBe(GLOBAL_SLOT);
      expect(wipePacket[6]).toBe(FieldID.YUBIAUTH);
    },
    3000,
  );

  it('surfaces firmware errors during legacy Yubikey wipe', async () => {
    const transport = new MockTransport();
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0, productId: 0 });

    vi.spyOn(transport, 'send').mockImplementation(async () => {
      setTimeout(() => {
        (transport as any).simulateResponse('Error not in config mode');
      }, 10);
    });

    await expect(device.wipeYubiAuth()).rejects.toThrow(/config mode/i);
  });

  it('maps device locked errors to config mode guidance', async () => {
    const transport = new MockTransport();
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0, productId: 0 });

    vi.spyOn(transport, 'send').mockImplementation(async () => {
      setTimeout(() => {
        (transport as any).simulateResponse('Error device locked');
      }, 10);
    });

    await expect(device.wipePrivateKey(101)).rejects.toThrow(/config mode/i);
  });

  it('keeps DUO device type after unlock without -D suffix', async () => {
    const transport = new MockTransport();
    (transport as any).deviceType = 'duo';
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0x1d50, productId: 0x614c });
    expect(device.state.deviceType).toBe(DeviceType.DUO);

    (transport as any).simulateResponse('INITIALIZED-Dv3.0.0-prod');
    expect(device.state.deviceType).toBe(DeviceType.DUO);
    expect(device.state.isLocked).toBe(true);

    (transport as any).simulateResponse('UNLOCKEDv3.0.0-prod');
    expect(device.state.deviceType).toBe(DeviceType.DUO);
    expect(device.state.isLocked).toBe(false);
  });
/*
it('should timeout if hardware does not respond', async () => {
  vi.useFakeTimers();
...
  await expect(promise).rejects.toThrow('timed out');
  vi.useRealTimers();
});
*/
});
