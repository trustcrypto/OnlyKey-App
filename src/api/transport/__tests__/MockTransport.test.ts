import { describe, it, expect, vi } from 'vitest';
import { MockTransport } from '../MockTransport';
import { OnlyKeyDevice } from '../../device/OnlyKeyDevice';
import { MessageID, FieldID, DeviceType } from '../../device/types';

describe('MockTransport', () => {
  it('connects and emits classic initialized status', async () => {
    const t = new MockTransport({ deviceType: 'classic', responseDelayMs: 0 });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    // After time sync + status
    expect(device.state.isConnected).toBe(true);
    expect(device.state.deviceType === DeviceType.CLASSIC || device.state.deviceType === DeviceType.UNKNOWN).toBe(true);
  });

  it('seeds USB product id for DUO', async () => {
    const t = new MockTransport({ deviceType: 'duo' });
    expect(t.getConnectedDevice().productId).toBe(0x614c);
  });

  it('reports bootloader USB PID 0xB001', () => {
    const t = new MockTransport({ deviceType: 'bootloader' });
    expect(t.getConnectedDevice()).toEqual({ vendorId: 0x0000, productId: 0xb001 });
  });

  it('unlocks on setPin and stores snapshot', async () => {
    const t = new MockTransport({ deviceType: 'classic' });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    await device.setPin('1234');
    expect(device.state.isLocked).toBe(false);
    expect(t.getSnapshot().isLocked).toBe(false);
  });

  it('rejects wrong PIN when correctPin is configured', async () => {
    const t = new MockTransport({ correctPin: '9999', unlockEntersConfigMode: false });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });

    await expect(device.setPin('1111')).rejects.toThrow(/incorrect PIN/i);
    expect(device.state.isLocked).toBe(true);

    await device.setPin('9999');
    expect(device.state.isLocked).toBe(false);
  });

  it('returns binary labels that parse into the device map', async () => {
    const t = new MockTransport({
      binaryLabels: true,
      initialLabels: { 1: 'Gmail', 7: 'Bank' },
      responseDelayMs: 0,
    });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    await device.setPin('1');

    const labels = await device.getLabels();
    expect(labels.get(1)).toBe('Gmail');
    expect(labels.get(7)).toBe('Bank');
  });

  it('emits firmware-coded HID slot bytes so slots 10–24 survive getLabels', async () => {
    const t = new MockTransport({
      binaryLabels: true,
      initialLabels: { 10: 'Slack', 12: 'Bank', 20: 'Yellow', 24: 'Purple' },
      responseDelayMs: 0,
    });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    await device.setPin('1');

    const labels = await device.getLabels();
    expect(labels.get(10)).toBe('Slack');
    expect(labels.get(12)).toBe('Bank');
    expect(labels.get(20)).toBe('Yellow');
    expect(labels.get(24)).toBe('Purple');
    expect(labels.get(16)).toBeUndefined();
  });

  it('emits preference confirmation strings for matchPredicate waits', async () => {
    const t = new MockTransport({ requireConfigMode: false });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    await device.setPin('1');

    await expect(device.setLockout(30)).resolves.toBeUndefined();
    await expect(device.setTypeSpeed(4)).resolves.toBeUndefined();
    await expect(device.setKbdLayout(1)).resolves.toBeUndefined();
    await expect(device.setWipeMode(1)).resolves.toBeUndefined();
    await expect(device.setLedBrightness(8)).resolves.toBeUndefined();
    await expect(device.setLockButton(1)).resolves.toBeUndefined();
    await expect(device.setDerivedChallengeMode(1)).resolves.toBeUndefined();
    await expect(device.setHmacChallengeMode(1)).resolves.toBeUndefined();
    await expect(device.setModKeyMode(1)).resolves.toBeUndefined();
    await expect(device.setBackupKeyMode(1)).resolves.toBeUndefined();
  });

  it('enforces config mode when requireConfigMode is true', async () => {
    const t = new MockTransport({
      requireConfigMode: true,
      unlockEntersConfigMode: false,
    });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    // Unlocked but not config mode — writes rejected
    t.setLocked(false);
    t.setConfigMode(false);
    device.state.isLocked = false;
    device.state.isConfigMode = false;

    await expect(device.setSlot(1, FieldID.LABEL, 'X')).rejects.toThrow(/config mode/i);

    // Config mode (device may still appear locked) — writes accepted
    t.setConfigMode(true);
    device.state.isConfigMode = true;
    device.state.isLocked = true;
    await expect(device.setSlot(1, FieldID.LABEL, 'X')).resolves.toBeUndefined();
    expect(t.labels.get(1)).toBe('X');
  });

  it('updates labels map on LABEL field writes and wipe', async () => {
    const t = new MockTransport({ requireConfigMode: false, initialLabels: {} });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    await device.setPin('1');

    await device.setSlot(3, FieldID.LABEL, 'Twitter');
    expect(t.labels.get(3)).toBe('Twitter');

    await device.wipeSlot(3);
    expect(t.labels.get(3)).toBe('empty');
  });

  it('confirms Yubi AES set and silent global wipe', async () => {
    const t = new MockTransport({ requireConfigMode: false });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    await device.setPin('1');

    // setYubiAuth runs public id through hexToModhex(..., reverse:true) — needs modhex charset
    await expect(
      device.setYubiAuth('ccddcceeffcc', 'aabbccddeeff', '00112233445566778899aabbccddeeff')
    ).resolves.toBeUndefined();

    await expect(device.wipeYubiAuth()).resolves.toBeUndefined();
  });

  it('firmware kick reports REBOOTING and enters bootloader', async () => {
    const t = new MockTransport({ requireConfigMode: false });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    await device.setPin('1');

    await device.triggerBootloader();
    expect(t.getSnapshot().isBootloader).toBe(true);
  });

  it('loads firmware blocks while in bootloader', async () => {
    const t = new MockTransport({ deviceType: 'bootloader' });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    device.state.isBootloader = true;

    await expect(device.loadFirmwareBlocks(['aabbccdd', '11223344'])).resolves.toBeUndefined();
  });

  it('emits NEXT BLOCK and SUCCESS immediately on the last chunk of a firmware block', async () => {
    const t = new MockTransport({ deviceType: 'bootloader' });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    device.state.isBootloader = true;
    const messages: string[] = [];
    device.on('messageReceived', (m) => messages.push(m));

    await device.loadFirmwareBlocks(['aa']);

    expect(messages).toEqual(expect.arrayContaining(['NEXT BLOCK', 'SUCCESSFULLY LOADED FW']));
    expect(messages).not.toContain('RECEIVED OKFWUPDATE');
  });

  it('emits text labels when binaryLabels is false', async () => {
    const t = new MockTransport({ binaryLabels: false, startLocked: false, initialLabels: { 1: 'A', 11: 'B' } });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    await device.getLabels();
    expect(device.state.labels.get(1)).toBe('A');
    expect(device.state.labels.get(11)).toBe('B');
  });

  it('decodes raw numeric PIN digits and DUO locked status', async () => {
    const t = new MockTransport({ deviceType: 'duo', startLocked: true, correctPin: '12' });
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    t.sentPackets.length = 0;
    const packet = new Uint8Array(64);
    packet.set([0xff, 0xff, 0xff, 0xff, MessageID.OKSETPIN, 1, 2]);
    await t.send(0, packet);
    expect(t.getSnapshot().isLocked).toBe(false);
  });

  it('returns OK for empty label maps and unused message ids', async () => {
    const t = new MockTransport({ deviceType: 'bootloader', initialLabels: {} });
    await t.connect({ vendorId: 0, productId: 0 });
    const received: string[] = [];
    t.onReceive((data) => {
      received.push(String.fromCharCode(...data.filter((b) => b >= 32 && b < 127)));
    });
    const labels = new Uint8Array(64);
    labels.set([0xff, 0xff, 0xff, 0xff, MessageID.OKGETLABELS]);
    await t.send(0, labels);
    const unused = new Uint8Array(64);
    unused.set([0xff, 0xff, 0xff, 0xff, MessageID.OKGETPUBKEY]);
    await t.send(0, unused);
    expect(received.some((s) => s.includes('OK'))).toBe(true);
  });

  it('stays silent on intermediate 0xFF firmware chunks', async () => {
    const t = new MockTransport({ deviceType: 'bootloader' });
    await t.connect({ vendorId: 0, productId: 0 });
    const received: Uint8Array[] = [];
    t.onReceive((data) => received.push(data));

    const packet = new Uint8Array(64);
    packet.set([0xff, 0xff, 0xff, 0xff, MessageID.OKFWUPDATE, 0xff, 0xaa]);
    await t.send(0, packet);

    expect(received).toHaveLength(0);
  });

  it('records sent packets for inspection', async () => {
    const t = new MockTransport();
    const device = new OnlyKeyDevice(t);
    await device.connect({ vendorId: 0, productId: 0 });
    t.sentPackets.length = 0;
    await device.setPin('12');
    expect(t.sentPackets.length).toBeGreaterThan(0);
    expect(t.sentPackets[0][4]).toBe(MessageID.OKSETPIN);
  });

  it('simulateResponse remains available for unit tests', async () => {
    const t = new MockTransport();
    const device = new OnlyKeyDevice(t);
    const spy = vi.fn();
    device.on('statusChange', spy);
    t.simulateResponse('UNLOCKEDv3.0.0-prod');
    expect(device.state.isLocked).toBe(false);
    expect(spy).toHaveBeenCalled();
  });
});
