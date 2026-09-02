import React, { useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { KEYBOARD_LAYOUTS, KEYBOARD_LAYOUT_LABELS, WIPE_MODE_FULL } from '../api/device/firmwareConstants';
import { SYSADMIN_MODE_PREF_HINT } from '../data/configMode';
import { TOOLTIPS } from '../data/tooltips';
import { CautionButton, SetButton } from './ui/forms';
import { PrefRow } from './ui/PrefRow';
import { PseudoTabBar, PseudoTabPanel } from './ui/PseudoTabs';

type PrefTab = 'standard' | 'advanced';

const Preferences: React.FC = () => {
  const { device } = useDeviceStore();
  const [activeTab, setActiveTab] = useState<PrefTab>('standard');
  const [typeSpeed, setTypeSpeed] = useState('');
  const [layout, setLayout] = useState(0x01);
  const [led, setLed] = useState('');
  const [lockout, setLockout] = useState('');
  const [lockButton, setLockButton] = useState('');
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

  const advancedRight = (
    <>
      <PrefRow
        title="Derived Key User Input Mode"
        tooltip={TOOLTIPS.challengeMode}
        description="Enable or disable challenge for derived keys (SSH/PGP)"
      >
        <SetButton disabled={busy} onClick={() => run('Derived key mode', () => device.setDerivedChallengeMode(0))}>
          Challenge Code
        </SetButton>
        <SetButton disabled={busy} onClick={() => run('Derived key mode', () => device.setDerivedChallengeMode(1))}>
          Button Press
        </SetButton>
      </PrefRow>

      <PrefRow
        title="Stored Key User Input Mode"
        tooltip={TOOLTIPS.challengeMode}
        description="Enable or disable challenge for stored keys (SSH/PGP)"
      >
        <SetButton disabled={busy} onClick={() => run('Stored key mode', () => device.setStoredChallengeMode(0))}>
          Challenge Code
        </SetButton>
        <SetButton disabled={busy} onClick={() => run('Stored key mode', () => device.setStoredChallengeMode(1))}>
          Button Press
        </SetButton>
      </PrefRow>

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
