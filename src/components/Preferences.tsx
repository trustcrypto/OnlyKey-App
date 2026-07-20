import React, { useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { KEYBOARD_LAYOUTS, KEYBOARD_LAYOUT_LABELS, WIPE_MODE_FULL } from '../api/device/firmwareConstants';
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

  const run = async (action: () => Promise<unknown>) => {
    if (!device) return;
    try {
      await action();
    } catch (err) {
      console.error(err);
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
        <SetButton onClick={() => run(() => device.setTypeSpeed(parseInt(typeSpeed, 10)))}>Set Type Speed</SetButton>
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
        <SetButton onClick={() => run(() => device.setKbdLayout(layout))}>Set Layout</SetButton>
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
        <SetButton onClick={() => run(() => device.setLedBrightness(parseInt(led, 10)))}>Set Brightness</SetButton>
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
        <SetButton onClick={() => run(() => device.setLockout(parseInt(lockout, 10)))}>Set Lockout</SetButton>
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
        <SetButton onClick={() => run(() => device.setLockButton(parseInt(lockButton, 10)))}>Set as Lock Button</SetButton>
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
        <SetButton onClick={() => run(() => device.setModKeyMode(1))}>Yes</SetButton>
        <SetButton onClick={() => run(() => device.setModKeyMode(0))}>No</SetButton>
      </PrefRow>

      <PrefRow
        title="HMAC User Input Mode"
        tooltip={TOOLTIPS.hmacMode}
        description="Require a button press for HMAC challenge-response operations?"
      >
        <SetButton onClick={() => run(() => device.setHmacChallengeMode(1))}>Yes</SetButton>
        <SetButton onClick={() => run(() => device.setHmacChallengeMode(0))}>No</SetButton>
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
        <CautionButton onClick={() => run(() => device.setWipeMode(WIPE_MODE_FULL))}>Set Full Wipe Mode</CautionButton>
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
        <SetButton onClick={() => run(() => device.setDerivedChallengeMode(0))}>Challenge Code</SetButton>
        <SetButton onClick={() => run(() => device.setDerivedChallengeMode(1))}>Button Press</SetButton>
      </PrefRow>

      <PrefRow
        title="Stored Key User Input Mode"
        tooltip={TOOLTIPS.challengeMode}
        description="Enable or disable challenge for stored keys (SSH/PGP)"
      >
        <SetButton onClick={() => run(() => device.setStoredChallengeMode(0))}>Challenge Code</SetButton>
        <SetButton onClick={() => run(() => device.setStoredChallengeMode(1))}>Button Press</SetButton>
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
        <CautionButton onClick={() => run(() => device.setBackupKeyMode(1))}>Lock Backup Key</CautionButton>
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
          onChange={(id) => setActiveTab(id as PrefTab)}
        />

        <PseudoTabPanel id="standard" active={activeTab}>
          <div className="pref-panel">
            <div>{standardLeft}</div>
            <div>{standardRight}</div>
          </div>
        </PseudoTabPanel>

        <PseudoTabPanel id="advanced" active={activeTab}>
          <p className="pref-advanced-note">
            These settings require your OnlyKey to be in <strong>config mode</strong>.
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