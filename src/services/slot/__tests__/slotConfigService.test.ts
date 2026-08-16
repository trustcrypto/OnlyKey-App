import { describe, expect, it, vi } from 'vitest';
import { FieldID } from '../../../api/device/types';
import { MFA_TYPE_GOOGLE_AUTH, MFA_TYPE_YUBI_OTP } from '../../../api/device/firmwareConstants';
import { base32ToHex } from '../../../utils/base32';
import { saveSlotConfig, type SlotFormState, type SlotEnabledState } from '../slotConfigService';

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
});
