import { DeviceType } from '../api/device/types';
import { deviceProductName } from './deviceProduct';

type ConfigModeHold = {
  isDuo: boolean;
  button: 1 | 6;
  holdSeconds: 10 | 5;
  product: string;
};

function configModeHold(deviceType: DeviceType): ConfigModeHold {
  if (deviceType === DeviceType.DUO) {
    return { isDuo: true, button: 1, holdSeconds: 10, product: deviceProductName(deviceType) };
  }
  return { isDuo: false, button: 6, holdSeconds: 5, product: deviceProductName(deviceType) };
}

/** Full how-to for entering config mode. Capitalized for a new sentence; lowercase after "To do this". */
export function configModeHowToText(
  deviceType: DeviceType,
  options?: { capitalize?: boolean },
): string {
  const { isDuo, button, holdSeconds, product } = configModeHold(deviceType);
  const hold = `hold down button #${button} on your ${product} for ${holdSeconds}+ seconds and release.`;
  const pin = isDuo
    ? 'If a PIN was previously set, re-enter the PIN to enter config mode.'
    : 'Enter your PIN.';
  const body = `${hold} The light will turn off. ${pin} You will notice the OnlyKey flashes red in config mode.`;
  if (options?.capitalize === false) return body;
  return body.charAt(0).toUpperCase() + body.slice(1);
}

export function configModeTooltipText(deviceType: DeviceType): string {
  const { isDuo, button, holdSeconds } = configModeHold(deviceType);
  if (isDuo) {
    return `Hold button #${button} for ${holdSeconds}+ seconds and release. The light turns off. If a PIN is set, re-enter it. The LED flashes red.`;
  }
  return `Hold button #${button} for ${holdSeconds}+ seconds and release. The light turns off. Enter your PIN. The LED flashes red.`;
}

export function configModePassphraseHint(deviceType: DeviceType): string {
  return (
    'To set a new passphrase on your OnlyKey put OnlyKey in config mode. ' +
    configModeHowToText(deviceType)
  );
}

export const CONFIG_MODE_REQUIRED =
  'Put your OnlyKey in config mode (flashing red LED) before saving or wiping private keys.';

/** Generic refusal when firmware names config mode (prefs, restore, firmware, keys). */
export const CONFIG_MODE_FOR_OPERATION =
  'OnlyKey must be in config mode (flashing red LED) for this operation.';

/** Extra line for Standard prefs — Sysadmin Mode makes firmware require config mode for all writes. */
export const SYSADMIN_MODE_PREF_HINT =
  'When Sysadmin Mode is on, turn it off (Advanced preferences, in config mode) to change Standard settings while unlocked.';
