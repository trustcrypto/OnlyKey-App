import { describe, expect, it, vi } from 'vitest';
import { FieldID } from '../../../api/device/types';
import { MFA_TYPE_GOOGLE_AUTH, MFA_TYPE_YUBI_OTP } from '../../../api/device/firmwareConstants';
import { base32ToHex } from '../../../utils/base32';
import { DeviceType } from '../../../api/device/types';
import {
  saveSlotConfig,
  validateDuoNoPinSlot,
  wipeSlotData,
  type SlotFormState,
  type SlotEnabledState,
} from '../slotConfigService';

function emptyForm(overrides: Partial<SlotFormState> = {}): SlotFormState {
  return {
    label: '',
    url: '',
    username: '',
    password: '',
    passwordConfirm: '',
    delay1: '0',
    delay2: '0',
    delay3: '0',
    nextKey4: '0',
    nextKey1: '0',
    nextKey2: '0',
    nextKey5: '0',
    nextKey3: '0',
    slotTypeSpeed: '0',
    mfaMode: 'none',
    totpSecret: '',
    yubiPublicId: '',
    yubiPrivateId: '',
    yubiSecretKey: '',
    ...overrides,
  };
}

function mockDevice() {
  return {
    setSlot: vi.fn().mockResolvedValue(undefined),
    setSlotTypeSpeed: vi.fn().mockResolvedValue(undefined),
  };
}

describe('saveSlotConfig', () => {
  it('writes firmware Google Auth TFATYPE and raw TOTP secret bytes', async () => {
    const device = mockDevice();
    const secret = 'JBSWY3DPEHPK3PXP';
    const enabled: SlotEnabledState = { totp: true };

    await saveSlotConfig(device as never, 1, enabled, emptyForm({ totpSecret: secret }));

    const hex = base32ToHex(secret);
    const bytes = hex.match(/.{2}/g)?.map((h) => parseInt(h, 16)) || [];
    expect(device.setSlot).toHaveBeenCalledWith(1, FieldID.TFATYPE, MFA_TYPE_GOOGLE_AUTH);
    expect(device.setSlot).toHaveBeenCalledWith(1, FieldID.TFAUSERNAME, bytes);
  });

  it('writes firmware Yubi OTP TFATYPE, not the HMAC+Yubi code', async () => {
    const device = mockDevice();
    const enabled: SlotEnabledState = { mfa: true };

    await saveSlotConfig(
      device as never,
      2,
      enabled,
      emptyForm({
        yubiPublicId: 'cccccccccccc',
        yubiPrivateId: '001122334455',
        yubiSecretKey: '00112233445566778899aabbccddeeff',
      })
    );

    expect(device.setSlot).toHaveBeenCalledWith(2, FieldID.TFATYPE, MFA_TYPE_YUBI_OTP);
    expect(device.setSlot).not.toHaveBeenCalledWith(2, FieldID.TFATYPE, '2');
    expect(device.setSlot).not.toHaveBeenCalledWith(2, FieldID.TFATYPE, '1');
  });

  it('writes label, url, username, password, delays, and next-keys when enabled', async () => {
    const device = mockDevice();
    await saveSlotConfig(
      device as never,
      3,
      {
        label: true,
        url: true,
        username: true,
        password: true,
        delay1: true,
        nextKey1: true,
        slotTypeSpeed: true,
      },
      emptyForm({
        label: 'Work',
        url: 'https://ex.test',
        username: 'ada',
        password: 'secret',
        passwordConfirm: 'secret',
        delay1: '2',
        nextKey1: '1',
        slotTypeSpeed: '4',
      })
    );

    expect(device.setSlot).toHaveBeenCalledWith(3, FieldID.LABEL, 'Work');
    expect(device.setSlot).toHaveBeenCalledWith(3, FieldID.URL, 'https://ex.test');
    expect(device.setSlot).toHaveBeenCalledWith(3, FieldID.USERNAME, 'ada');
    expect(device.setSlot).toHaveBeenCalledWith(3, FieldID.PASSWORD, 'secret');
    expect(device.setSlot).toHaveBeenCalledWith(3, FieldID.DELAY1, '2');
    expect(device.setSlot).toHaveBeenCalledWith(3, FieldID.NEXTKEY1, '1');
    expect(device.setSlotTypeSpeed).toHaveBeenCalledWith(3, 4);
  });

  it('rejects mismatched passwords and mixed TOTP+Yubi', async () => {
    const device = mockDevice();
    await expect(
      saveSlotConfig(
        device as never,
        1,
        { password: true },
        emptyForm({ password: 'a', passwordConfirm: 'b' })
      )
    ).rejects.toThrow(/do not match/);

    await expect(
      saveSlotConfig(
        device as never,
        1,
        { totp: true, mfa: true },
        emptyForm({
          totpSecret: 'JBSWY3DPEHPK3PXP',
          yubiPublicId: 'cc',
          yubiPrivateId: '11',
          yubiSecretKey: '22',
        })
      )
    ).rejects.toThrow(/not both/);
  });

  it('rejects incomplete Yubi fields', async () => {
    await expect(
      saveSlotConfig(
        mockDevice() as never,
        1,
        { mfa: true },
        emptyForm({ yubiPublicId: 'cc' })
      )
    ).rejects.toThrow(/cannot be blank/);
  });
});

describe('validateDuoNoPinSlot', () => {
  it('allows mixed fields when a PIN is set or the device is Classic', () => {
    expect(() =>
      validateDuoNoPinSlot(DeviceType.CLASSIC, false, { password: true, totp: true }, emptyForm({
        password: 'x',
        totpSecret: 'abc',
      }))
    ).not.toThrow();
    expect(() =>
      validateDuoNoPinSlot(DeviceType.DUO, true, { username: true }, emptyForm())
    ).not.toThrow();
  });

  it('blocks password+MFA and username/url on DUO without a PIN', () => {
    expect(() =>
      validateDuoNoPinSlot(
        DeviceType.DUO,
        false,
        { password: true, totp: true },
        emptyForm({ password: 'x', totpSecret: 'abc' })
      )
    ).toThrow(/not both/);
    expect(() =>
      validateDuoNoPinSlot(DeviceType.DUO, false, { username: true }, emptyForm())
    ).toThrow(/Username and URL require a device PIN/);
  });
});

describe('wipeSlotData', () => {
  it('wipes the requested slot', async () => {
    const wipeSlot = vi.fn().mockResolvedValue(undefined);
    await wipeSlotData({ wipeSlot } as never, 6);
    expect(wipeSlot).toHaveBeenCalledWith(6);
  });
});
