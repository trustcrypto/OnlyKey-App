import { describe, expect, it } from 'vitest';
import { DeviceType } from '../../api/device/types';
import {
  CONFIG_MODE_FOR_OPERATION,
  CONFIG_MODE_REQUIRED,
  SYSADMIN_MODE_PREF_HINT,
  configModeHowToText,
  configModePassphraseHint,
  configModeTooltipText,
} from '../configMode';

describe('configMode copy', () => {
  it('uses button #6 / 5+ seconds for Classic', () => {
    expect(configModeHowToText(DeviceType.CLASSIC)).toBe(
      'Hold down button #6 on your OnlyKey for 5+ seconds and release. The light will turn off. Enter your PIN. You will notice the OnlyKey flashes red in config mode.',
    );
  });

  it('uses button #1 / 10+ seconds for DUO', () => {
    expect(configModeHowToText(DeviceType.DUO)).toBe(
      'Hold down button #1 on your OnlyKey DUO for 10+ seconds and release. The light will turn off. If a PIN was previously set, re-enter the PIN to enter config mode. You will notice the OnlyKey flashes red in config mode.',
    );
  });

  it('can start lowercase after "To do this"', () => {
    expect(configModeHowToText(DeviceType.CLASSIC, { capitalize: false }).startsWith('hold down')).toBe(true);
  });

  it('embeds the how-to in the passphrase hint', () => {
    const hint = configModePassphraseHint(DeviceType.DUO);
    expect(hint).toContain('put OnlyKey in config mode');
    expect(hint).toContain(configModeHowToText(DeviceType.DUO));
  });

  it('keeps tooltip and error copy in sync with hold facts', () => {
    expect(configModeTooltipText(DeviceType.DUO)).toContain('button #1');
    expect(configModeTooltipText(DeviceType.CLASSIC)).toContain('button #6');
    expect(CONFIG_MODE_REQUIRED).toMatch(/flashing red LED/i);
    expect(CONFIG_MODE_FOR_OPERATION).toMatch(/flashing red LED/i);
    expect(SYSADMIN_MODE_PREF_HINT).toMatch(/sysadmin mode/i);
  });
});
