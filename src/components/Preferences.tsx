import React, { useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { KEYBOARD_LAYOUTS, KEYBOARD_LAYOUT_LABELS, WIPE_MODE_FULL, firmwareAtLeast } from '../api/device/firmwareConstants';
import { SYSADMIN_MODE_PREF_HINT } from '../data/configMode';
import { TOOLTIPS } from '../data/tooltips';
import { CautionButton, SetButton } from './ui/forms';
import { HelpTip } from './ui/HelpTip';
import { PrefRow } from './ui/PrefRow';
import { PseudoTabBar, PseudoTabPanel } from './ui/PseudoTabs';

type PrefTab = 'standard' | 'advanced';

type Tip = { href?: string; text: string };
type Choice = { value: number; label: string; tooltip?: Tip };

// 0 = challenge code, 1 = button press, 2 = no press. Release firmware refuses
// 2 for fields 21 and 22, so only field 30 offers it.
const CODE_OR_PRESS: Choice[] = [
  { value: 0, label: 'Challenge Code (enter 3 digits)' },
  { value: 1, label: 'Button Press (tap any button)' },
];
const WEB_AGENT_CHOICES: Choice[] = [
  ...CODE_OR_PRESS,
  { value: 2, label: 'None (no confirmation) - for unattended agents', tooltip: TOOLTIPS.webAgentNoInput },
];
// Field 31: bit 0 lets the web app use stored keys, bit 1 turns off the FIDO2
// extension. 0x03 is not offered: with bit 1 set, bit 0 means nothing.
const WEBCRYPT_CHOICES: Choice[] = [
  { value: 0x01, label: 'Stored and derived keys', tooltip: TOOLTIPS.webcryptStored },
  { value: 0x00, label: 'Derived keys only', tooltip: TOOLTIPS.webcryptDerivedOnly },
  { value: 0x02, label: 'Off - the web app cannot reach this key', tooltip: TOOLTIPS.webcryptOff },
];

const ChoiceGroup: React.FC<{
  legend: string;
  name: string;
  value: number | null;
  onChange: (value: number) => void;
  choices: Choice[];
  tooltip?: Tip;
}> = ({ legend, name, value, onChange, choices, tooltip }) => (
  <fieldset className="pref-choice-group">
    <legend>
      {legend}
      {tooltip && <HelpTip href={tooltip.href} tooltip={tooltip.text} />}
    </legend>
    {choices.map((c) => (
      <div key={c.value} className="pref-choice-row">
        <label className="pref-choice">
          <input
            type="radio"
            name={name}
            checked={value === c.value}
            onChange={() => onChange(c.value)}
            className="ok-control"
          />
          {c.label}
        </label>
        {c.tooltip && <HelpTip href={c.tooltip.href} tooltip={c.tooltip.text} />}
      </div>
    ))}
  </fieldset>
);

const Preferences: React.FC = () => {
  const { device, version } = useDeviceStore();
  const [activeTab, setActiveTab] = useState<PrefTab>('standard');
  const [typeSpeed, setTypeSpeed] = useState('');
  const [layout, setLayout] = useState(0x01);
  const [led, setLed] = useState('');
  const [lockout, setLockout] = useState('');
  const [lockButton, setLockButton] = useState('');
  // null = not chosen. The app cannot read these settings back from the key,
  // so only a family the user picks is written.
  const [derivedInput, setDerivedInput] = useState<number | null>(null);
  const [storedInput, setStoredInput] = useState<number | null>(null);
  const [webAgentInput, setWebAgentInput] = useState<number | null>(null);
  const [webcryptPolicy, setWebcryptPolicy] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (label: string, action: () => Promise<unknown>) => {
    if (!device || busy) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await action();
      setStatus(`${label} saved.`);
    } catch (err) {
      let msg = err instanceof Error ? err.message : String(err);
      if (activeTab === 'standard' && /config mode/i.test(msg)) {
        msg = `${msg} ${SYSADMIN_MODE_PREF_HINT}`;
      }
      console.error(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!device) return null;

  const standardLeft = (
    <>
      <PrefRow
        title="Keyboard Type Speed"
        tooltip={TOOLTIPS.typeSpeed}
        hint="(1 = slowest, 4 = default, 10 = fastest)"
      >
        <input
          type="number"
          min={1}
          max={10}
          placeholder="1 - 10"
          value={typeSpeed}
          onChange={(e) => setTypeSpeed(e.target.value)}
          className="field-input field-input-narrow-pref"
        />
        <SetButton
          disabled={busy || !typeSpeed}
          onClick={() => run('Type speed', () => device.setTypeSpeed(parseInt(typeSpeed, 10)))}
        >
          Set Type Speed
        </SetButton>
      </PrefRow>

      <PrefRow title="Keyboard Layout" tooltip={TOOLTIPS.keyboardLayout}>
        <select
          value={layout}
          onChange={(e) => setLayout(parseInt(e.target.value, 10))}
          className="field-input field-select-pref"
        >
          {KEYBOARD_LAYOUTS.map((l) => (
            <option key={l.value} value={l.value}>
              {KEYBOARD_LAYOUT_LABELS[l.value] ?? l.label}
            </option>
          ))}
        </select>
        <SetButton disabled={busy} onClick={() => run('Keyboard layout', () => device.setKbdLayout(layout))}>
          Set Layout
        </SetButton>
      </PrefRow>

      <PrefRow
        title="Indicator Light (LED) Brightness"
        tooltip={TOOLTIPS.ledBrightness}
        hint="(1 = dimmest, 8 = default, 10 = brightest)"
      >
        <input
          type="number"
          min={1}
          max={10}
          placeholder="1 - 10"
          value={led}
          onChange={(e) => setLed(e.target.value)}
          className="field-input field-input-narrow-pref"
        />
        <SetButton
          disabled={busy || !led}
          onClick={() => run('LED brightness', () => device.setLedBrightness(parseInt(led, 10)))}
        >
          Set Brightness
        </SetButton>
      </PrefRow>
    </>
  );

  const standardRight = (
    <>
      <PrefRow
        title="Inactivity Lockout Timer"
        tooltip={TOOLTIPS.lockout}
        hint="(1 – 255 Minutes, 30 = default, 0 to disable)"
      >
        <input
          type="number"
          min={0}
          max={255}
          placeholder="1 - 255"
          value={lockout}
          onChange={(e) => setLockout(e.target.value)}
          className="field-input field-input-lockout"
        />
        <SetButton
          disabled={busy || lockout === ''}
          onClick={() => run('Lockout', () => device.setLockout(parseInt(lockout, 10)))}
        >
          Set Lockout
        </SetButton>
      </PrefRow>

      <PrefRow
        title="Lock Button"
        tooltip={TOOLTIPS.lockButton}
        description="The OnlyKey and the computer are locked automatically when this lock button is pressed (0 to disable)."
      >
        <input
          type="number"
          min={0}
          max={6}
          placeholder="1 - 6"
          value={lockButton}
          onChange={(e) => setLockButton(e.target.value)}
          className="field-input field-input-narrow-pref"
        />
        <SetButton
          disabled={busy || lockButton === ''}
          onClick={() => run('Lock button', () => device.setLockButton(parseInt(lockButton, 10)))}
        >
          Set as Lock Button
        </SetButton>
      </PrefRow>
    </>
  );

  const advancedLeft = (
    <>
      <PrefRow
        title="Sysadmin Mode"
        tooltip={TOOLTIPS.sysadminMode}
        description="Allow advanced keystroke combinations and system commands?"
      >
        <SetButton disabled={busy} onClick={() => run('Sysadmin Mode', () => device.setModKeyMode(1))}>
          Yes
        </SetButton>
        <SetButton disabled={busy} onClick={() => run('Sysadmin Mode', () => device.setModKeyMode(0))}>
          No
        </SetButton>
      </PrefRow>

      <PrefRow
        title="HMAC User Input Mode"
        tooltip={TOOLTIPS.hmacMode}
        description="Require a button press for HMAC challenge-response operations?"
      >
        <SetButton disabled={busy} onClick={() => run('HMAC mode', () => device.setHmacChallengeMode(1))}>
          Yes
        </SetButton>
        <SetButton disabled={busy} onClick={() => run('HMAC mode', () => device.setHmacChallengeMode(0))}>
          No
        </SetButton>
      </PrefRow>

      <PrefRow
        title="Full Wipe Mode"
        tooltip={TOOLTIPS.fullWipe}
        description={
          <>
            Only sensitive data is wiped by default.
            <br />
            <u>Full Wipe</u> – <em>Wipe device and firmware must be reloaded.</em>
          </>
        }
        warning='WARNING - Once set to "Full Wipe" this cannot be changed.'
      >
        <CautionButton disabled={busy} onClick={() => run('Wipe mode', () => device.setWipeMode(WIPE_MODE_FULL))}>
          Set Full Wipe Mode
        </CautionButton>
      </PrefRow>
    </>
  );

  // Fields 30 and 31 exist only on firmware 3.1.0 and later; older firmware
  // gives no reply to them, so the request would only time out.
  const has310 = firmwareAtLeast(version, 3, 1, 0);
  const inputModeWrites: { name: string; write: () => Promise<void> }[] = [];
  if (derivedInput !== null) {
    inputModeWrites.push({ name: 'SSH/GPG derived keys', write: () => device.setDerivedChallengeMode(derivedInput) });
  }
  if (storedInput !== null) {
    inputModeWrites.push({ name: 'stored keys', write: () => device.setStoredChallengeMode(storedInput) });
  }
  if (has310 && webAgentInput !== null) {
    inputModeWrites.push({ name: 'web and agent derived keys', write: () => device.setWebAgentDeriveMode(webAgentInput) });
  }
  // Each family is its own write; if a later one fails, say which were already saved.
  const saveUserInputModes = () =>
    run('User input modes', async () => {
      const saved: string[] = [];
      for (const { name, write } of inputModeWrites) {
        try {
          await write();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const end = /[.!?]$/.test(msg) ? '' : '.';
          throw new Error(saved.length ? `${msg}${end} Already saved: ${saved.join(', ')}.` : msg);
        }
        saved.push(name);
      }
    });

  const advancedRight = (
    <>
      <PrefRow
        title="User Input Modes"
        tooltip={TOOLTIPS.userInputModes}
        description={
          <em>
            How you confirm an operation on the device. The app cannot read the current settings, so only the
            families you choose here are written.
          </em>
        }
        hint={has310 ? undefined : 'Web and agent derived keys and Webcrypt Access need firmware 3.1.0 or later.'}
      >
        <ChoiceGroup
          legend="SSH/GPG derived keys"
          name="derivedKeyInput"
          value={derivedInput}
          onChange={setDerivedInput}
          choices={CODE_OR_PRESS}
        />
        <ChoiceGroup
          legend="Stored keys (PGP, SSH, RSA and ECC slots)"
          name="storedKeyInput"
          value={storedInput}
          onChange={setStoredInput}
          choices={CODE_OR_PRESS}
        />
        {has310 && (
          <ChoiceGroup
            legend="Web and agent derived keys"
            name="webAgentDeriveInput"
            value={webAgentInput}
            onChange={setWebAgentInput}
            choices={WEB_AGENT_CHOICES}
            tooltip={TOOLTIPS.webAgentDerive}
          />
        )}
        <SetButton disabled={busy || !inputModeWrites.length} onClick={saveUserInputModes}>
          Save User Input Modes
        </SetButton>
      </PrefRow>

      {has310 && (
        <PrefRow
          title="Webcrypt Access"
          tooltip={TOOLTIPS.webcryptAccess}
          description={
            <em>
              What the OnlyKey web app is allowed to do. The app cannot read the current setting, so nothing is
              written until you choose one.
            </em>
          }
        >
          <ChoiceGroup
            legend="The web app can use"
            name="webcryptPolicy"
            value={webcryptPolicy}
            onChange={setWebcryptPolicy}
            choices={WEBCRYPT_CHOICES}
          />
          <SetButton
            disabled={busy || webcryptPolicy === null}
            onClick={() => webcryptPolicy !== null && run('Webcrypt access', () => device.setWebcryptPolicy(webcryptPolicy))}
          >
            Save Webcrypt Access
          </SetButton>
        </PrefRow>
      )}

      <PrefRow
        title="Backup Key Mode"
        tooltip={TOOLTIPS.backupKeyMode}
        description={
          <>
            <u>Locked</u> - <em>Backup key may not be changed on device</em>
          </>
        }
        warning='WARNING - Once set to "Locked" this cannot be changed.'
      >
        <CautionButton disabled={busy} onClick={() => run('Backup key mode', () => device.setBackupKeyMode(1))}>
          Lock Backup Key
        </CautionButton>
      </PrefRow>
    </>
  );

  return (
    <div className="page-shell">
      <header className="page-header">
        <h2>Preferences</h2>
      </header>
      <div className="page-body page-body--scroll content-panel">
        <PseudoTabBar
          tabs={[
            { id: 'standard', label: 'Standard' },
            { id: 'advanced', label: 'Advanced' },
          ]}
          active={activeTab}
          onChange={(id) => {
            setActiveTab(id as PrefTab);
            setError(null);
            setStatus(null);
          }}
        />

        {(status || error) && (
          <div className="mb-3 space-y-1" data-testid="pref-feedback">
            {status && (
              <p className="status-success text-sm" data-testid="pref-status">
                {status}
              </p>
            )}
            {error && (
              <p className="critical-text text-sm" data-testid="pref-error">
                {error}
              </p>
            )}
          </div>
        )}

        <PseudoTabPanel id="standard" active={activeTab}>
          <p className="text-muted text-sm mb-3" data-testid="pref-standard-note">
            Standard preferences apply while your OnlyKey is unlocked. Config mode is not required.
          </p>
          <div className="pref-panel">
            <div>{standardLeft}</div>
            <div>{standardRight}</div>
          </div>
        </PseudoTabPanel>

        <PseudoTabPanel id="advanced" active={activeTab}>
          <p className="pref-advanced-note">
            These settings require your OnlyKey to be in <strong>config mode</strong>.
            Enabling <strong>Sysadmin Mode</strong> also makes firmware require config mode for{' '}
            <em>all</em> slot/preference writes (including Standard) until Sysadmin Mode is turned off.
          </p>
          <div className="pref-panel">
            <div>{advancedLeft}</div>
            <div>{advancedRight}</div>
          </div>
        </PseudoTabPanel>
      </div>
    </div>
  );
};

export default Preferences;
