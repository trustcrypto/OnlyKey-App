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

  it('keeps a USB-identified DUO when 24 labels arrive including slots above 12', async () => {
    const transport = new MockTransport({ deviceType: 'duo', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x1d50, productId: 0x614c });
    expect(device.state.deviceType).toBe(DeviceType.DUO);

    for (let slot = 1; slot <= 24; slot += 1) {
      device.state.labels.set(slot, `slot${slot}`);
    }

    expect(device['inferDeviceTypeFromLabels'](true)).toBe(false);
    expect(device.state.deviceType).toBe(DeviceType.DUO);
    expect(device.state.maxLabelSlot).toBe(24);
  });

  it('promotes UNKNOWN to DUO from slot 13 after snapshotting label keys', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0, productId: 0 });
    device.state.deviceType = DeviceType.UNKNOWN;
    device.state.labels.set(1, 'Gmail');
    device.state.labels.set(13, 'Yellow');

    expect(device['inferDeviceTypeFromLabels'](true)).toBe(true);
    expect(device.state.deviceType).toBe(DeviceType.DUO);
    expect(device.state.deviceTypeSource).toBe('labels:slot>12');
    expect(device.state.maxLabelSlot).toBe(13);
  });

  it('getLabels keeps a DUO typed from USB after a 24-slot firmware-coded stream', async () => {
    const initialLabels: Record<number, string> = {};
    for (let slot = 1; slot <= 24; slot += 1) initialLabels[slot] = `s${slot}`;
    const transport = new MockTransport({
      deviceType: 'duo',
      startLocked: false,
      binaryLabels: true,
      initialLabels,
      responseDelayMs: 0,
    });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x1d50, productId: 0x614c });
    const labels = await device.getLabels();
    expect(labels.get(10)).toBe('s10');
    expect(labels.get(20)).toBe('s20');
    expect(labels.get(24)).toBe('s24');
    expect(device.state.deviceType).toBe(DeviceType.DUO);
    expect(device.state.maxLabelSlot).toBe(24);
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

  it('request timeout does not clear a later waiter', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });

    vi.useFakeTimers();
    try {
      vi.spyOn(transport, 'send').mockImplementation(async () => undefined);
      const timedOut = device.setPin('1');
      await vi.advanceTimersByTimeAsync(0);
      type Waiter = { id: number; reject: (err: Error) => void; timer: NodeJS.Timeout };
      const waiterA = (device as unknown as { pendingRequest: Waiter | null }).pendingRequest;
      expect(waiterA).toBeTruthy();

      const waiterB = {
        id: waiterA!.id + 1,
        resolve: vi.fn(),
        reject: vi.fn(),
        timer: setTimeout(() => undefined, 999_999),
      };
      (device as unknown as { pendingRequest: typeof waiterB }).pendingRequest = waiterB;

      await vi.advanceTimersByTimeAsync(10_000);
      expect((device as unknown as { pendingRequest: typeof waiterB | null }).pendingRequest).toBe(waiterB);
      expect(waiterB.reject).not.toHaveBeenCalled();
      waiterA!.reject(new Error('cleanup'));
      await expect(timedOut).rejects.toThrow(/cleanup/);
      clearTimeout(waiterB.timer);
    } finally {
      vi.useRealTimers();
    }
  });

  it('setPrivateKey does not wait for HID replies on intermediate chunks', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });

    let privPackets = 0;
    const origSend = transport.send.bind(transport);
    vi.spyOn(transport, 'send').mockImplementation(async (reportId, packet) => {
      if (packet[4] !== MessageID.OKSETPRIV) return origSend(reportId, packet);
      privPackets += 1;
      if (privPackets === 2) {
        setTimeout(() => transport.simulateResponse('OK'), 5);
      }
      return undefined;
    });

    await device.setPrivateKey(1, 2, new Uint8Array(60).fill(1));
    expect(privPackets).toBe(2);
  });

  it('encodes DUO PIN setup with 0xFF prefix', async () => {
    const transport = new MockTransport({ deviceType: 'duo', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x1d50, productId: 0x614c });
    const sendSpy = vi.spyOn(transport, 'send');
    sendSpy.mockClear();
    await device.sendPinDUO(['1234561'], true);
    const packet = sendSpy.mock.calls[0][1] as Uint8Array;
    expect(packet[4]).toBe(MessageID.OKSETPIN);
    expect(packet[5]).toBe(255);
    expect(packet[6]).toBe(49);
    expect(packet[22]).toBe(0);
    expect(packet[38]).toBe(0);
  });

  it('packs DUO self-destruct PIN at SETUP_MANUAL offset 38', async () => {
    const transport = new MockTransport({ deviceType: 'duo', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x1d50, productId: 0x614c });
    const sendSpy = vi.spyOn(transport, 'send');
    sendSpy.mockClear();
    await device.sendPinDUO(['3253614', '', '6543216'], true);
    const packet = sendSpy.mock.calls[0][1] as Uint8Array;
    expect(packet[5]).toBe(255);
    expect(String.fromCharCode(...packet.slice(6, 13))).toBe('3253614');
    expect(packet[22]).toBe(0);
    expect(String.fromCharCode(...packet.slice(38, 45))).toBe('6543216');
  });

  it('rejects DUO setup PINs that are too short, use 0/7–9, or match SD', async () => {
    const transport = new MockTransport({ deviceType: 'duo', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x1d50, productId: 0x614c });
    await expect(device.sendPinDUO(['123'], true)).rejects.toThrow(/7–10 digits using only 1–6/);
    await expect(device.sendPinDUO(['1234561'], true)).resolves.toBeUndefined();
    await expect(device.sendPinDUO(['1234568'], true)).rejects.toThrow(/7–10 digits using only 1–6/);
    await expect(device.sendPinDUO(['3253614', '3253614'], true)).rejects.toThrow(/different from the device PIN/);
    await expect(device.sendPinDUO(['3253614', '', '12'], true)).rejects.toThrow(/Self-destruct PIN must be 7–10/);
  });

  it('hashes a backup passphrase onto slot 131 type 161', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
    const sendSpy = vi.spyOn(transport, 'send');
    sendSpy.mockClear();
    await device.setBackupPassphrase('this passphrase is long enough!!');
    const priv = sendSpy.mock.calls
      .map((c) => c[1] as Uint8Array)
      .find((p) => p[4] === MessageID.OKSETPRIV);
    expect(priv?.[5]).toBe(131);
    expect(priv?.[6]).toBe(161);
  });

  it('firmwareUpdate kicks bootloader when not already in bootloader', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
    transport.setConfigMode(true);
    transport.setLocked(false);
    const sendSpy = vi.spyOn(transport, 'send');
    sendSpy.mockClear();
    await device.firmwareUpdate(['aabb']);
    const fw = sendSpy.mock.calls.map((c) => c[1] as Uint8Array).find((p) => p[4] === MessageID.OKFWUPDATE);
    expect(fw).toBeTruthy();
  });

  it('connect on a bootloader transport sets isBootloader without a manual assignment', async () => {
    const transport = new MockTransport({ deviceType: 'bootloader' });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0, productId: 0xb001 });
    expect(device.state.isBootloader).toBe(true);
    expect(device.state.isLocked).toBe(false);
    expect(device.state.deviceType).toBe(DeviceType.BOOTLOADER);
  });

  it('loadFirmwareBlocks waits for NEXT/SUCCESS on the last chunk of each block, not RECEIVED', async () => {
    const transport = new MockTransport({ deviceType: 'bootloader' });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0, productId: 0 });
    expect(device.state.isBootloader).toBe(true);
    transport.sentPackets.length = 0;
    const progress: number[] = [];

    await device.loadFirmwareBlocks(['aabbccdd', '11223344'], (pct) => progress.push(pct));

    const fw = transport.sentPackets.filter((p) => p[4] === MessageID.OKFWUPDATE);
    expect(fw).toHaveLength(2);
    expect(fw[0][5]).toBe(4);
    expect(fw[1][5]).toBe(4);
    expect(progress).toEqual([50, 100]);
  });

  it('loadFirmwareBlocks sends silent 0xFF chunks for a multi-packet block', async () => {
    const transport = new MockTransport({ deviceType: 'bootloader' });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0, productId: 0 });
    device.state.isBootloader = true;
    transport.sentPackets.length = 0;

    const longBlock = 'ab'.repeat(58);
    await device.loadFirmwareBlocks([longBlock]);

    const fw = transport.sentPackets.filter((p) => p[4] === MessageID.OKFWUPDATE);
    expect(fw).toHaveLength(2);
    expect(fw[0][5]).toBe(0xff);
    expect(fw[1][5]).toBe(1);
  });

  it('loadFirmwareBlocks rejects when the device is not in bootloader', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0, productId: 0 });
    await expect(device.loadFirmwareBlocks(['aabb'])).rejects.toThrow(/not in bootloader/i);
  });

  it('firmwareUpdate loads blocks when already in bootloader', async () => {
    const transport = new MockTransport({ deviceType: 'bootloader' });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0, productId: 0 });
    device.state.isBootloader = true;
    transport.sentPackets.length = 0;
    await device.firmwareUpdate(['deadbeef']);
    expect(transport.sentPackets.some((p) => p[4] === MessageID.OKFWUPDATE && p[5] === 4)).toBe(true);
  });

  it('beginClassicPinEntry waits on empty OKSETPIN / PIN2 / SDPIN', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
    const sendSpy = vi.spyOn(transport, 'send');
    sendSpy.mockClear();

    await device.beginClassicPinEntry('pin');
    expect(sendSpy.mock.calls[0][1][4]).toBe(MessageID.OKSETPIN);

    sendSpy.mockClear();
    await device.beginClassicPinEntry('pin2');
    expect(sendSpy.mock.calls[0][1][4]).toBe(MessageID.OKSETPIN2);

    sendSpy.mockClear();
    await device.beginClassicPinEntry('sdpin');
    expect(sendSpy.mock.calls[0][1][4]).toBe(MessageID.OKSETSDPIN);
  });

  it('setSlotFields, prefs, and hex private keys round-trip on the mock', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0, productId: 0 });
    await device.setSlotFields(1, [
      { fieldId: FieldID.LABEL, value: 'Mail' },
      { fieldId: FieldID.USERNAME, value: 'user' },
    ]);
    expect(transport.labels.get(1)).toBe('Mail');
    await device.setSecProfileMode(1);
    await device.setPin2();
    await device.setSDPin();
    await device.setPrivateKey(101, 1, 'ab'.repeat(32));
    await device.setPrivateKey(102, 1, new Uint8Array(32).fill(7));
    await device.setSlotTypeSpeed(1, 4);
    await device.setDerivedChallengeMode(1);
    await device.setStoredChallengeMode(1);
    await device.setHmacChallengeMode(1);
    await device.setModKeyMode(1);
    await device.setBackupKeyMode(1);
    await device.setLockout(5);
    await device.wipePrivateKey(101);
    await device.wipeSlot(1);
    expect(transport.labels.get(1)).toBe('empty');
    transport.simulateResponse('LOCKED');
    await device.disconnect();
    expect(device.state.isConnected).toBe(false);
  });

  it('applies DUO unlock and lock status strings', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: true });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0, productId: 0 });
    transport.simulateResponse('UNLOCKED-Dv3.0.0-prod');
    expect(device.state.isLocked).toBe(false);
    transport.simulateResponse('INITIALIZED-Dv3.0.0-prod');
    expect(device.state.isLocked).toBe(true);
  });

  it('reports restore progress and rejects empty backup hex', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0, productId: 0 });
    await expect(device.restore('')).rejects.toThrow(/empty/);
    const pcts: number[] = [];
    await device.restore('ab'.repeat(58), (p) => pcts.push(p));
    expect(pcts.some((p) => p <= 92)).toBe(true);
    expect(pcts[pcts.length - 1]).toBe(100);
  });

  it('sends a DUO unlock PIN without the 0xFF setup prefix', async () => {
    const transport = new MockTransport({ deviceType: 'duo', startLocked: true, correctPin: '3253614' });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x1d50, productId: 0x614c });
    const sendSpy = vi.spyOn(transport, 'send');
    sendSpy.mockClear();
    await device.sendPinDUO(['3253614'], false);
    const packet = sendSpy.mock.calls[0][1] as Uint8Array;
    expect(packet[4]).toBe(MessageID.OKSETPIN);
    expect(packet[5]).toBe(51);
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

  it('covers remaining type, label, preference, and disconnect branches', async () => {
    const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });

    expect(device['encodeSlotByte']('0A')).toBe(0x0a);
    expect(device['encodeSlotByte']('XX')).toBe(GLOBAL_SLOT);
    const labeled = device['buildMessage'](MessageID.OKSETSLOT, 1, 'LABEL', 'x');
    expect(labeled[6]).toBe(FieldID.LABEL);
    const numericField = device['buildMessage'](MessageID.OKSETSLOT, 1, '99', 'x');
    expect(numericField[6]).toBe(0x99);

    device.state.deviceType = DeviceType.UNINITIALIZED;
    transport.simulateResponse('UNLOCKEDv2.1.0-prod');
    expect(device.state.deviceType).toBe(DeviceType.CLASSIC);

    device.state.deviceType = DeviceType.UNINITIALIZED;
    transport.simulateResponse('UNLOCKED-Dv3.0.0-prod');
    expect(device.state.deviceType).toBe(DeviceType.DUO);

    device.state.deviceType = DeviceType.BOOTLOADER;
    expect(device['setClassicFromLabels']('labels')).toBe(false);

    transport.simulateBinaryLabel(7, 'unsolicited');
    expect(device.state.labels.get(7)).toBe('unsolicited');

    device.state.isConfigMode = true;
    device.state.isLocked = false;
    transport.simulateResponse('UNLOCKEDv3.0.0-prod');
    expect(device.state.isConfigMode).toBe(false);

    await device.setWipeMode(1);
    await device.setLedBrightness(8);
    await device.setKbdLayout(1);
    await device.setTypeSpeed(4);
    await device.setLockButton(1);
    await device.setYubiAuth('ccddcceeffcc', 'aabbccddeeff', '00112233445566778899aabbccddeeff');
    await device.setPrivateKey(101, 1, Array.from({ length: 32 }, () => 3));

    const wait = device['waitForMessage']('hello', 2000);
    await new Promise((r) => setTimeout(r, 20));
    transport.simulateResponse('hello from firmware');
    await expect(wait).resolves.toMatchObject({ text: expect.stringMatching(/hello/i) });

    const firstProbe = device.refreshStatus();
    const secondProbe = device.refreshStatus();
    await Promise.all([firstProbe, secondProbe]);

    transport.simulateResponse('Error unknown failure');
    transport.unplug();
    expect(device.state.isConnected).toBe(false);
  });

  it('rejects setSlot and wipeSlot when the device reports an error', async () => {
    const transport = new MockTransport({
      deviceType: 'classic',
      startLocked: true,
      requireConfigMode: true,
    });
    const device = new OnlyKeyDevice(transport);
    await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
    await expect(device.setSlot(1, FieldID.LABEL, 'Mail')).rejects.toThrow(/locked|config mode/i);
    await expect(device.wipeSlot(1)).rejects.toThrow(/locked|config mode/i);
  });
});

