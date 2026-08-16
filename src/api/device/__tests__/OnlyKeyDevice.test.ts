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

  it('classifies a wiped device as uninitialized and not locked', async () => {
    const transport = new MockTransport();
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0, productId: 0 });
    (transport as any).simulateResponse('UNINITIALIZEDv2.1.0-prod');

    expect(device.state.deviceType).toBe(DeviceType.UNINITIALIZED);
    expect(device.state.isLocked).toBe(false);
    expect(device.state.devicePinSet).toBe(false);
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

  it('maps device locked errors to unlock guidance (not config mode)', async () => {
    const transport = new MockTransport();
    const device = new OnlyKeyDevice(transport);

    await device.connect({ vendorId: 0, productId: 0 });

    vi.spyOn(transport, 'send').mockImplementation(async () => {
      setTimeout(() => {
        (transport as any).simulateResponse('Error device locked');
      }, 10);
    });

    await expect(device.wipePrivateKey(101)).rejects.toThrow(/locked/i);
  });

  it('standard preferences succeed unlocked without config mode', async () => {
    const transport = new MockTransport({
      deviceType: 'classic',
      startLocked: false,
      requireConfigMode: true,
      unlockEntersConfigMode: false,
    });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
    transport.setLocked(false);
    transport.setConfigMode(false);

    await expect(device.setTypeSpeed(4)).resolves.toBeUndefined();
    await expect(device.setLockout(30)).resolves.toBeUndefined();
    await expect(device.setLedBrightness(8)).resolves.toBeUndefined();
    await expect(device.setKbdLayout(1)).resolves.toBeUndefined();
    await expect(device.setLockButton(6)).resolves.toBeUndefined();
  });

  it('advanced preferences still need config mode when requireConfigMode', async () => {
    const transport = new MockTransport({
      deviceType: 'classic',
      startLocked: false,
      requireConfigMode: true,
      unlockEntersConfigMode: false,
    });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
    transport.setLocked(false);
    transport.setConfigMode(false);

    await expect(device.setModKeyMode(1)).rejects.toThrow(/config mode/i);
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

  it('detects classic keypad unlock via refreshStatus OKSETTIME probe', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: true });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
    expect(device.state.isLocked).toBe(true);

    // Simulate on-device unlock (keypad). Next OKSETTIME reports UNLOCKED.
    transport.setLocked(false);
    await device.refreshStatus();
    expect(device.state.isLocked).toBe(false);
  });

  it('does not re-lock on a stale INITIALIZED echo after keypad unlock', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: true });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
    expect(device.state.isLocked).toBe(true);

    transport.simulateResponse('UNLOCKEDv2.1.0-prod');
    expect(device.state.isLocked).toBe(false);

    transport.simulateResponse('INITIALIZEDv2.1.0-prod');
    expect(device.state.isLocked).toBe(false);
    expect(device.state.isConfigMode).toBe(false);
  });

  it('restore sends silent intermediate OKRESTORE packets then waits on final', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    transport.setConfigMode(true);
    // setConfigMode forces locked=true in mock — unlock again for config ops that need unlocked+config
    transport.setLocked(false);
    transport.setConfigMode(true);
    // Actually setConfigMode sets locked true. requireConfigMode default false so OK path works without config.
    const t2 = new MockTransport({ deviceType: 'classic', startLocked: false, requireConfigMode: false });
    const device = new OnlyKeyDevice(t2);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });

    const sendSpy = vi.spyOn(t2, 'send');
    // 60 bytes → one full intermediate (57) + final (3)
    const hex = 'aa'.repeat(60);
    await device.restore(hex);

    // Two HID sends for restore (after connect's OKSETTIMEs)
    const restoreSends = sendSpy.mock.calls
      .map((c) => c[1] as Uint8Array)
      .filter((p) => p[4] === MessageID.OKRESTORE);
    expect(restoreSends.length).toBe(2);
    expect(restoreSends[0][5]).toBe(0xff); // intermediate flag
    expect(restoreSends[1][5]).toBe(3); // final length
  });

  it('restore rejects when not in config mode (requireConfigMode mock)', async () => {
    const transport = new MockTransport({
      deviceType: 'classic',
      startLocked: false,
      requireConfigMode: true,
      unlockEntersConfigMode: false,
    });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
    // unlocked but not config mode
    transport.setLocked(false);
    transport.setConfigMode(false);

    await expect(device.restore('aabbccdd')).rejects.toThrow(/config mode/i);
  });
