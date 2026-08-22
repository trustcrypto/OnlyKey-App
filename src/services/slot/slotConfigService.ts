import type { DeviceClient } from '../../api/device/DeviceClient';
import { FieldID, DeviceType } from '../../api/device/types';
import { MFA_TYPE_GOOGLE_AUTH, MFA_TYPE_YUBI_OTP } from '../../api/device/firmwareConstants';
import { base32ToHex } from '../../utils/base32';
import { hexToModhex } from '../../api/device/utils';

export interface SlotFormState {
  label: string;
  url: string;
  username: string;
  password: string;
  passwordConfirm: string;
  delay1: string;
  delay2: string;
  delay3: string;
  nextKey4: string;
  nextKey1: string;
  nextKey2: string;
  nextKey5: string;
  nextKey3: string;
  slotTypeSpeed: string;
  mfaMode: 'none' | 'googleAuthOtp' | 'YubikeyOtp';
  totpSecret: string;
  yubiPublicId: string;
  yubiPrivateId: string;
  yubiSecretKey: string;
}

export type SlotEnabledState = Record<string, boolean>;

export function validateDuoNoPinSlot(
  deviceType: DeviceType,
  devicePinSet: boolean,
  enabled: SlotEnabledState,
  form: SlotFormState
): void {
  if (deviceType !== DeviceType.DUO || devicePinSet) return;

  const settingPassword = enabled.password && !!form.password;
  const settingTotp = enabled.totp && !!form.totpSecret.trim();
  const settingYubi =
    enabled.mfa &&
    !!(form.yubiPublicId.trim() || form.yubiPrivateId.trim() || form.yubiSecretKey.trim());
  const settingMfa = settingTotp || settingYubi;

  if (settingPassword && settingMfa) {
    throw new Error(
      'OnlyKey DUO without a device PIN supports static password OR MFA per slot — not both. Set a device PIN in Setup to enable full login slots.'
    );
  }
  if (enabled.username || enabled.url) {
    throw new Error('Username and URL require a device PIN on OnlyKey DUO.');
  }
}

export async function saveSlotConfig(
  device: DeviceClient,
  slotId: number,
  enabled: SlotEnabledState,
  form: SlotFormState
): Promise<void> {
  if (enabled.label && form.label) await device.setSlot(slotId, FieldID.LABEL, form.label);
  if (enabled.url && form.url) await device.setSlot(slotId, FieldID.URL, form.url);
  if (enabled.username && form.username) await device.setSlot(slotId, FieldID.USERNAME, form.username);

  if (enabled.password && form.password) {
    if (form.password !== form.passwordConfirm) throw new Error('Password fields do not match.');
    await device.setSlot(slotId, FieldID.PASSWORD, form.password);
  }

  if (enabled.delay1) await device.setSlot(slotId, FieldID.DELAY1, form.delay1);
  if (enabled.delay2) await device.setSlot(slotId, FieldID.DELAY2, form.delay2);
  if (enabled.delay3) await device.setSlot(slotId, FieldID.DELAY3, form.delay3);

  if (enabled.nextKey4) await device.setSlot(slotId, FieldID.NEXTKEY4, form.nextKey4);
  if (enabled.nextKey1) await device.setSlot(slotId, FieldID.NEXTKEY1, form.nextKey1);
  if (enabled.nextKey2) await device.setSlot(slotId, FieldID.NEXTKEY2, form.nextKey2);
  if (enabled.nextKey5) await device.setSlot(slotId, FieldID.NEXTKEY5, form.nextKey5);
  if (enabled.nextKey3) await device.setSlot(slotId, FieldID.NEXTKEY3, form.nextKey3);

  if (enabled.slotTypeSpeed) {
    await device.setSlotTypeSpeed(slotId, parseInt(form.slotTypeSpeed, 10));
  }

  const settingTotp = enabled.totp && !!form.totpSecret.trim();
  const settingYubi =
    enabled.mfa &&
    !!(form.yubiPublicId.trim() || form.yubiPrivateId.trim() || form.yubiSecretKey.trim());

  if (settingTotp && settingYubi) {
    throw new Error('Set OATH-TOTP or Yubikey OTP per slot — not both.');
  }

  if (settingTotp) {
    const hex = base32ToHex(form.totpSecret.replace(/\s/g, ''));
    const bytes = hex.match(/.{2}/g)?.map((h) => parseInt(h, 16)) || [];
    // HID OKSETSLOT payload is 57 bytes. A longer secret is silently truncated
    // on the wire and TOTP will never match an authenticator using the full key.
    if (bytes.length > 57) {
      throw new Error(
        `TOTP secret is too long for OnlyKey (${bytes.length} bytes). Maximum is 57 bytes (91 Base32 characters).`,
      );
    }
    await device.setSlot(slotId, FieldID.TFATYPE, MFA_TYPE_GOOGLE_AUTH);
    await device.setSlot(slotId, FieldID.TFAUSERNAME, bytes);
  } else if (settingYubi) {
    if (!form.yubiPublicId || !form.yubiPrivateId || !form.yubiSecretKey) {
      throw new Error('Yubikey public ID, private ID, and secret cannot be blank.');
    }
    await device.setSlot(slotId, FieldID.TFATYPE, MFA_TYPE_YUBI_OTP);
    const pubId = hexToModhex(form.yubiPublicId.replace(/\s/g, '').slice(0, 32), true);
    const privId = form.yubiPrivateId.replace(/\s/g, '').slice(0, 12);
    const secKey = form.yubiSecretKey.replace(/\s/g, '').slice(0, 32);
    const combined = (pubId + privId + secKey).match(/.{2}/g)?.map((h) => parseInt(h, 16)) || [];
    await device.setSlot(slotId, FieldID.YUBIAUTH, combined);
  }
}

export async function wipeSlotData(device: DeviceClient, slotId: number): Promise<void> {
  await device.wipeSlot(slotId);
}