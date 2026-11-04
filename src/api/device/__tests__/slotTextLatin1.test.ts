import { describe, it, expect } from 'vitest';
import { OnlyKeyDevice, firstNonLatin1Index } from '../OnlyKeyDevice';
import { MockTransport } from '../../transport/MockTransport';
import { MessageID, FieldID } from '../types';

async function unlockedDevice() {
  const transport = new MockTransport({ deviceType: 'classic', startLocked: false });
  const device = new OnlyKeyDevice(transport);
  await device.connect({ vendorId: 0x16c0, productId: 0x0486 });
  transport.sentPackets.length = 0;
  return { transport, device };
}

function setSlotPackets(transport: MockTransport) {
  return transport.sentPackets.filter((p) => p[4] === MessageID.OKSETSLOT);
}

describe('firstNonLatin1Index', () => {
  it('accepts ASCII and the whole Latin-1 range', () => {
    expect(firstNonLatin1Index('')).toBe(-1);
    expect(firstNonLatin1Index('Password1!')).toBe(-1);
    expect(firstNonLatin1Index('Grüße àéîõü ß ÿ')).toBe(-1);
    expect(firstNonLatin1Index(String.fromCharCode(0xff))).toBe(-1);
  });

  it('finds the first character above U+00FF', () => {
    expect(firstNonLatin1Index(String.fromCharCode(0x100))).toBe(0);
    expect(firstNonLatin1Index('price 5€')).toBe(7);
    expect(firstNonLatin1Index('ab\u{1F600}')).toBe(2);
    expect(firstNonLatin1Index('Œuvre')).toBe(0);
  });
});

describe('OnlyKeyDevice.setSlot text encoding', () => {
  it('sends Latin-1 text one byte per character', async () => {
    const { transport, device } = await unlockedDevice();

    await device.setSlot(1, FieldID.PASSWORD, 'pässwörd');

    const [packet] = setSlotPackets(transport);
    expect(packet[5]).toBe(1);
    expect(packet[6]).toBe(FieldID.PASSWORD);
    expect(Array.from(packet.slice(7, 15))).toEqual([0x70, 0xe4, 0x73, 0x73, 0x77, 0xf6, 0x72, 0x64]);
    expect(packet[15]).toBe(0);
  });

  it.each([
    ['euro sign', 'pa€€word'],
    ['emoji (surrogate pair)', 'pass\u{1F511}'],
    ['Latin Extended-A', 'Łódź'],
  ])('rejects %s instead of truncating it to its low byte', async (_name, text) => {
    const { transport, device } = await unlockedDevice();

    await expect(device.setSlot(1, FieldID.PASSWORD, text)).rejects.toThrow(/Latin-1/);
    expect(setSlotPackets(transport)).toHaveLength(0);
  });

  it('does not echo the rejected value in the error', async () => {
    const { device } = await unlockedDevice();

    await expect(device.setSlot(1, FieldID.PASSWORD, 'secret€')).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('secret') }),
    );
  });

  it('leaves byte-array values untouched', async () => {
    const { transport, device } = await unlockedDevice();

    await device.setSlot(1, FieldID.DELAY1, [0xff, 0x00, 0x7f]);

    const [packet] = setSlotPackets(transport);
    expect(Array.from(packet.slice(7, 10))).toEqual([0xff, 0x00, 0x7f]);
  });
});
