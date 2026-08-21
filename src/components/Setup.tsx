import React, { useState, useRef } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { DeviceType } from '../api/device/types';
import { parseBackupData, parseFirmwareData } from '../api/device/utils';
import { storePendingFirmware } from '../desktop/firmwareCheck';
import { importPemKey, isSelectionRequiredError } from '../services/keyImport/keyImportService';
import { parseKeyBundle } from '../services/keyImport/keyBundleParser';
import PrivateKeySelectDialog from './dialogs/PrivateKeySelectDialog';
import type { KeyCandidate } from '../services/keyImport/keyImportService';
import { KEY_SLOTS } from '../api/device/keyParser';
import { configModePassphraseHint } from '../data/configMode';
import { TOOLTIPS } from '../data/tooltips';
import ConfigModeInstructions from './ConfigModeInstructions';
import { CriticalText, SetButton, StepFieldset } from './ui/forms';
import { HelpTip } from './ui/HelpTip';

type ClassicStep =
  | 'Step1' | 'Step2' | 'Step3' | 'Step4' | 'Step5' | 'Step6' | 'Step7'
  | 'Step8' | 'Step9' | 'Step10' | 'Step11';

type DuoStep = 'Step1' | 'Step2' | 'Step8' | 'Step9' | 'Step10' | 'Step11';

const BACKUP_RSA_SLOTS = [
  ...KEY_SLOTS.rsa.map((s) => ({ value: s, label: `RSA ${s}` })),
  ...KEY_SLOTS.ecc.map((s) => ({ value: s, label: `ECC ${s - 100} (${s})` })),
];

const Setup: React.FC = () => {
  const { device, deviceType, isLocked, isConfigMode, setWorking } = useDeviceStore();
  const [guided, setGuided] = useState(false);
  const [advancedSetup, setAdvancedSetup] = useState(false);
  const [classicStep, setClassicStep] = useState<ClassicStep>('Step1');
  const [duoStep, setDuoStep] = useState<DuoStep>('Step1');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passcode1Disclaimer, setPasscode1Disclaimer] = useState(false);
  const [passcode2Disclaimer, setPasscode2Disclaimer] = useState(false);
  const [passcode3Disclaimer, setPasscode3Disclaimer] = useState(false);
  const [duoPins, setDuoPins] = useState({ primary: '', primaryConfirm: '', sd: '', sdConfirm: '' });
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupConfirm, setBackupConfirm] = useState('');
  const [backupKeyMode, setBackupKeyMode] = useState(0);
  const [secProfileMode, setSecProfileMode] = useState(1);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const firmwareInputRef = useRef<HTMLInputElement>(null);
  const [pgpKey, setPgpKey] = useState('');
  const [pgpPasscode, setPgpPasscode] = useState('');
  const [pgpSlot, setPgpSlot] = useState(1);
  const [pgpSetAsSignature, setPgpSetAsSignature] = useState(false);
  const [pgpBackupKeyMode, setPgpBackupKeyMode] = useState(0);
  const [pgpCandidates, setPgpCandidates] = useState<KeyCandidate[]>([]);
  const [showPgpKeySelect, setShowPgpKeySelect] = useState(false);

  const isDuo = deviceType === DeviceType.DUO;
  const isUninitialized = deviceType === DeviceType.UNINITIALIZED;
  const isInitialized = !isUninitialized;

  const run = async (fn: () => Promise<void>) => {
    setIsProcessing(true);
    setError(null);
    try {
      await fn();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const resetToStep1 = () => {
    setGuided(false);
    setError(null);
    setPasscode1Disclaimer(false);
    setPasscode2Disclaimer(false);
    setPasscode3Disclaimer(false);
    isDuo ? setDuoStep('Step1') : setClassicStep('Step1');
  };

  const startGuided = () => {
    setGuided(true);
    setError(null);
    if (isDuo) {
      setDuoStep(advancedSetup ? 'Step2' : 'Step8');
    } else {
      setClassicStep('Step2');
    }
  };

  const startUnguided = (step: ClassicStep | DuoStep) => {
    setGuided(false);
    setError(null);
    isDuo ? setDuoStep(step as DuoStep) : setClassicStep(step as ClassicStep);
  };

  const handleBackup = () =>
    run(async () => {
      if (!backupPassphrase) throw new Error('Passphrase cannot be empty.');
      if (backupPassphrase !== backupConfirm) throw new Error('Passphrase fields do not match.');
      if (backupPassphrase.length < 25) throw new Error('Passphrase must be at least 25 characters.');
      if (!isInitialized && advancedSetup) await device!.setBackupKeyMode(backupKeyMode);
      await device!.setBackupPassphrase(backupPassphrase);
      if (guided) {
        isDuo ? setDuoStep('Step10') : setClassicStep('Step10');
      } else {
        resetToStep1();
      }
    });

  const importPgpBackupKey = async (selectedCandidateId?: string, targetSlot?: number) => {
    if (!pgpKey.trim()) throw new Error('OpenPGP private key cannot be empty.');
    if (!pgpPasscode) throw new Error('Passcode cannot be empty.');
    await importPemKey(device!, {
      pem: pgpKey.trim(),
      passcode: pgpPasscode,
      slotChoice: pgpSlot,
      setAsBackup: true,
      setAsSignature: pgpSetAsSignature,
      selectedCandidateId,
      targetSlot,
    });
    await device!.setBackupKeyMode(pgpBackupKeyMode);
    setPgpKey('');
    setPgpPasscode('');
    setShowPgpKeySelect(false);
    setPgpCandidates([]);
    if (guided) {
      isDuo ? setDuoStep('Step10') : setClassicStep('Step10');
    } else {
      resetToStep1();
    }
  };

  const loadPgpBackupKey = (selectedCandidateId?: string, targetSlot?: number) =>
    run(() => importPgpBackupKey(selectedCandidateId, targetSlot));

  const handlePgpImport = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      await importPgpBackupKey();
    } catch (e: unknown) {
      if (isSelectionRequiredError(e)) {
        const bundle = await parseKeyBundle(pgpKey.trim(), pgpPasscode, pgpSlot);
        setPgpCandidates(bundle.candidates);
        setShowPgpKeySelect(true);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async (file: File) =>
    run(async () => {
      const hex = parseBackupData(await file.text());
      if (!hex) throw new Error('Could not parse backup file.');
      setWorking(true, 'Preparing restore…', 0);
      try {
        await device!.restore(hex, (pct) => {
          const label =
            pct >= 95
              ? 'Applying backup on OnlyKey…'
              : `Sending backup to OnlyKey… ${Math.round(pct)}%`;
          setWorking(true, label, pct);
        });
        setWorking(true, 'Restore complete — remove and reinsert OnlyKey', 100);
      } finally {
        setWorking(false);
      }
      if (guided) {
        isDuo ? resetToStep1() : setClassicStep('Step11');
      } else {
        resetToStep1();
      }
    });

  const handleFirmware = async (file: File) =>
    run(async () => {
      const blocks = parseFirmwareData(await file.text());
      if (!blocks.length) throw new Error('Could not parse firmware file.');
      storePendingFirmware(blocks);
      await device!.firmwareUpdate(blocks);
      resetToStep1();
    });

  const SetupShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="page-shell">
      <header className="page-header">
        <h2 className="text-xl font-bold">
          {isDuo ? 'OnlyKey DUO Setup' : 'OnlyKey Setup'}{' '}
          <HelpTip
            href={isDuo ? TOOLTIPS.setup.duoHref : TOOLTIPS.setup.href}
            tooltip={TOOLTIPS.setup.text}
          />
        </h2>
      </header>
      <div className="page-body page-body--scroll setup-body space-y-4">{children}</div>
    </div>
  );

  const StepNav: React.FC<{
    showGuided?: boolean;
    onNext?: () => void;
    onCancel?: () => void;
    nextLabel?: string;
    nextDisabled?: boolean;
  }> = ({ showGuided, onNext, onCancel, nextLabel = 'Next', nextDisabled }) => (
    <div className="setup-step-nav flex flex-wrap items-center gap-3 border-t border-white/10">
      {showGuided && isUninitialized && (
        <>
          <b>Guided Setup</b>{' '}
          <SetButton onClick={onNext ?? startGuided} disabled={isProcessing || nextDisabled}>
            {isProcessing ? 'Please wait…' : 'Next'}
          </SetButton>
        </>
      )}
      {!showGuided && onNext && (
        <>
          <SetButton onClick={onNext} disabled={isProcessing || nextDisabled}>
            {isProcessing ? 'Please wait…' : nextLabel}
          </SetButton>
          {onCancel && (
            <SetButton onClick={onCancel} disabled={isProcessing}>
              Cancel
            </SetButton>
          )}
        </>
      )}
    </div>
  );

  const ConfigModeBlock: React.FC = () => (
    <div className="init-only setup-ready-block">
      <p className="setup-ready-headline">
        Your OnlyKey{isDuo ? ' DUO' : ''} is ready to use!
      </p>
      <p className="setup-ready-sub">
        Use the options below to change PINs or backup passphrase.
      </p>
      <ConfigModeInstructions
        leadIn={
          <p className="setup-ready-critical">
            Before selecting an option below, you must first put your OnlyKey{isDuo ? ' DUO' : ''} into config mode.
          </p>
        }
      />
    </div>
  );

  const Step1: React.FC = () => (
    <div id="Step1">
      {isUninitialized && (
        <p>
          Begin the Guided Setup wizard by clicking [Next] at bottom. Or, if you would like to upgrade firmware on your
          device, select [Load Firmware]. Advanced users may enable advanced setup options by checking this box:{' '}
          <input
            type="checkbox"
            checked={advancedSetup}
            onChange={(e) => setAdvancedSetup(e.target.checked)}
          />
        </p>
      )}

      {isInitialized && <ConfigModeBlock />}

      <div className="setup-action-buttons flex flex-wrap gap-2">
        {isUninitialized && (
          <SetButton onClick={() => startUnguided('Step11')}>Load Firmware</SetButton>
        )}
        {isInitialized && (
          <>
            <SetButton onClick={() => startUnguided('Step8')}>Set Backup Passphrase</SetButton>
            {!isDuo && (
              <>
                <SetButton onClick={() => startUnguided('Step2')}>Change Primary PIN</SetButton>
                <SetButton onClick={() => startUnguided('Step4')}>Change Secondary PIN</SetButton>
                <SetButton onClick={() => startUnguided('Step6')}>Change Self-Destruct PIN</SetButton>
              </>
            )}
            {isDuo && (
              <SetButton onClick={() => startUnguided('Step2')}>Set or Change OnlyKey DUO PINs</SetButton>
            )}
          </>
        )}
      </div>
    </div>
  );

  // --- DUO ---
  if (isDuo) {
    return (
      <SetupShell>
        {error && <p className="critical-text">{error}</p>}
        {isInitialized && isLocked && !isConfigMode && duoStep === 'Step1' && (
          <CriticalText>Put your OnlyKey DUO into config mode before continuing.</CriticalText>
        )}

        {duoStep === 'Step1' && <Step1 />}

        {duoStep === 'Step2' && (
          <div id="Step2">
            <h3>Set or Change PINs</h3>
            <p>
              Make sure to choose a device PIN that you will not forget and that only you know. Once set, it is required
              to know your device PIN to unlock your OnlyKey DUO, so keep a secure backup of your PIN somewhere in case
              you forget.
            </p>
            <p>
              DISCLAIMER &mdash; I understand that there is no way to recover my PINs, and, if I forget my PINs, the only
              way to recover my OnlyKey DUO is to perform a factory reset which wipes all sensitive information.
            </p>
            <label>
              <input
                type="checkbox"
                checked={passcode1Disclaimer}
                onChange={(e) => setPasscode1Disclaimer(e.target.checked)}
              />{' '}
              I understand and accept the above risk.
            </label>
            <p>
              Enter a 7-10 digit PIN code using ONLY the numbers 1 - 6. Using the numbers 1 - 6 allows you to physically
              enter the PIN onto OnlyKey in the event that the OnlyKey App is not available.
            </p>
            <p>Example of a <em>good</em> PIN: &apos;32536145&apos;</p>
            <p>Examples of <em>bad</em> PINs: &apos;1234567&apos; &apos;1111112&apos; &apos;1231231&apos;</p>
            <p>
              Once set, your PIN can be entered via the OnlyKey App or by physically touching device buttons. Touch
              buttons 1, 2, 3 to enter 1, 2, 3 and hold (for 1 second) buttons 1, 2, 3 to enter 4, 5, 6.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p>
                  <u>Device PIN</u>
                  <br />
                  <input
                    type="password"
                    value={duoPins.primary}
                    onChange={(e) => setDuoPins({ ...duoPins, primary: e.target.value })}
                    maxLength={16}
                    placeholder="Device PIN"
                  />
                  <br />
                  <input
                    type="password"
                    value={duoPins.primaryConfirm}
                    onChange={(e) => setDuoPins({ ...duoPins, primaryConfirm: e.target.value })}
                    maxLength={16}
                    placeholder="Confirm"
                  />
                  <br />
                  [required]
                </p>
              </div>
              <div>
                <p>
                  <u>Self-Destruct</u>
                  <br />
                  <input
                    type="password"
                    value={duoPins.sd}
                    onChange={(e) => setDuoPins({ ...duoPins, sd: e.target.value })}
                    maxLength={16}
                    placeholder="Self-Destruct PIN"
                  />
                  <br />
                  <input
                    type="password"
                    value={duoPins.sdConfirm}
                    onChange={(e) => setDuoPins({ ...duoPins, sdConfirm: e.target.value })}
                    maxLength={16}
                    placeholder="Confirm"
                  />
                  <br />
                  [optional, for wiping device and factory reset]
                </p>
              </div>
            </div>
          </div>
        )}

        {duoStep === 'Step8' && (
          <BackupPassphraseStep
            isInitialized={isInitialized}
            advancedSetup={advancedSetup}
            backupKeyMode={backupKeyMode}
            onBackupKeyModeChange={setBackupKeyMode}
            backupPassphrase={backupPassphrase}
            backupConfirm={backupConfirm}
            onPassphraseChange={setBackupPassphrase}
            onConfirmChange={setBackupConfirm}
            configHint={isInitialized ? configModePassphraseHint(deviceType) : undefined}
            onUsePgpKey={() => setDuoStep('Step9')}
          />
        )}

        {duoStep === 'Step9' && (
          <PgpBackupKeyStep
            pgpSlot={pgpSlot}
            onSlotChange={setPgpSlot}
            pgpKey={pgpKey}
            onKeyChange={setPgpKey}
            pgpPasscode={pgpPasscode}
            onPasscodeChange={setPgpPasscode}
            pgpSetAsSignature={pgpSetAsSignature}
            onSetAsSignatureChange={setPgpSetAsSignature}
            pgpBackupKeyMode={pgpBackupKeyMode}
            onBackupKeyModeChange={setPgpBackupKeyMode}
            configHint={isInitialized ? configModePassphraseHint(deviceType) : undefined}
            onUsePassphrase={() => setDuoStep('Step8')}
          />
        )}

        {duoStep === 'Step10' && (
          <RestoreStep
            inputRef={restoreInputRef}
            onFile={handleRestore}
          />
        )}

        {duoStep === 'Step11' && (
          <FirmwareStep
            inputRef={firmwareInputRef}
            onFile={handleFirmware}
          />
        )}

        {duoStep === 'Step1' && (
          <StepNav showGuided onNext={startGuided} />
        )}

        {duoStep === 'Step2' && (
          <StepNav
            onNext={() =>
              run(async () => {
                if (!passcode1Disclaimer) throw new Error('Please accept the disclaimer.');
                if (duoPins.primary !== duoPins.primaryConfirm) throw new Error('PINs do not match.');
                if (duoPins.sd && duoPins.sd !== duoPins.sdConfirm) throw new Error('Self-destruct PINs do not match.');
                const pins = duoPins.sd ? [duoPins.primary, duoPins.sd] : [duoPins.primary];
                await device!.sendPinDUO(pins, true);
                if (guided) setDuoStep('Step8');
                else resetToStep1();
              })
            }
            onCancel={resetToStep1}
            nextLabel="Next"
            nextDisabled={!passcode1Disclaimer || !duoPins.primary}
          />
        )}

        {(duoStep === 'Step8' || duoStep === 'Step9' || duoStep === 'Step10' || duoStep === 'Step11') && (
          <StepNav
            onNext={
              duoStep === 'Step8'
                ? handleBackup
                : duoStep === 'Step9'
                  ? handlePgpImport
                  : duoStep === 'Step10'
                    ? () => restoreInputRef.current?.click()
                    : () => firmwareInputRef.current?.click()
            }
            onCancel={resetToStep1}
            nextLabel={duoStep === 'Step11' ? 'Load Firmware to OnlyKey' : 'Next'}
          />
        )}

        <PrivateKeySelectDialog
          open={showPgpKeySelect}
          candidates={pgpCandidates}
          onClose={() => setShowPgpKeySelect(false)}
          onConfirm={(candidateId: string, slot: number) => loadPgpBackupKey(candidateId, slot)}
        />
      </SetupShell>
    );
  }

  // --- CLASSIC ---
  return (
    <SetupShell>
      {error && <p className="critical-text">{error}</p>}

      {classicStep === 'Step1' && <Step1 />}

      {classicStep === 'Step2' && (
        <div id="Step2">
          {isInitialized ? (
            <>
              <h3>Change Primary Profile PIN</h3>
              <p>
                Make sure to choose a new PIN that you will not forget and that only you know. It may be easier to
                remember a pattern rather than numbers. It is also good to keep a secure backup of your PIN somewhere
                just in case you forget.
              </p>
              <p>
                DISCLAIMER &mdash; I understand that there is no way to recover my PIN, and, if I forget my PIN, the
                only way to recover my OnlyKey is to perform a factory reset which wipes all sensitive information.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={passcode1Disclaimer}
                  onChange={(e) => setPasscode1Disclaimer(e.target.checked)}
                />{' '}
                I understand and accept the above risk.
              </label>
              <p>
                Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [Next] below.
              </p>
            </>
          ) : (
            <>
              <h3>Enter PIN on OnlyKey Keypad</h3>
              <p>
                The first step in setting up OnlyKey is to set a PIN code using the six-button keypad on the OnlyKey.
                This PIN will be used to unlock your OnlyKey to access your accounts.
                <br />
                <br />
                Make sure to choose a PIN that you will not forget and that only you know. It may be easier to remember a
                pattern rather than numbers. It is also good to keep a secure backup of your PIN somewhere just in case you
                forget.
              </p>
              <p>
                DISCLAIMER &mdash; I understand that there is no way to recover my PIN, and, if I forget my PIN, the
                only way to recover my OnlyKey is to perform a factory reset which wipes all sensitive information.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={passcode1Disclaimer}
                  onChange={(e) => setPasscode1Disclaimer(e.target.checked)}
                />{' '}
                I understand and accept the above risk.
              </label>
              <p>
                Enter a 7 - 10 digit PIN on your OnlyKey six button keypad. When you are finished, click [Next] below.
              </p>
            </>
          )}
        </div>
      )}

      {classicStep === 'Step3' && (
        <div id="Step3">
          <h3>Re-enter PIN on OnlyKey Keypad</h3>
          <p>
            Re-enter the 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [Next] below.
          </p>
        </div>
      )}

      {classicStep === 'Step4' && (
        <div id="Step4">
          {isInitialized ? (
            <>
              <h3>Change Second Profile PIN</h3>
              <p>
                Make sure to choose a new PIN that you will not forget and that only you know. It may be easier to
                remember a pattern rather than numbers. It is also good to keep a secure backup of your PIN somewhere
                just in case you forget.
              </p>
              <p>
                DISCLAIMER &mdash; I understand that there is no way to recover my PIN, and, if I forget my PIN, the
                only way to recover my OnlyKey is to perform a factory reset which wipes all sensitive information.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={passcode3Disclaimer}
                  onChange={(e) => setPasscode3Disclaimer(e.target.checked)}
                />{' '}
                I understand and accept the above risk.
              </label>
              <p>
                Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [Next] below.
              </p>
            </>
          ) : advancedSetup ? (
            <>
              <h3>Enter PIN for Second Profile on OnlyKey Keypad</h3>
              <p>
                Your OnlyKey is now set up to store 12 accounts and is ready to use! OnlyKey permits adding a second
                profile to store an additonal 12 accounts (24 total). Set a second PIN to access the second profile.
                Second profile must be configured during initial setup and cannot be set up later.
                <br />
                <br />
                <SetButton onClick={() => setClassicStep('Step6')}>
                  <b>I don&apos;t want a second profile, skip this step</b>
                </SetButton>
              </p>
              Select a second profile type:
              <br />
              <br />
              <label>
                <input
                  type="radio"
                  checked={secProfileMode === 1}
                  onChange={() => setSecProfileMode(1)}
                />{' '}
                <u>Standard Profile (recommended for most users)</u>
              </label>
              <br />
              <label>
                <input
                  type="radio"
                  checked={secProfileMode === 2}
                  onChange={() => setSecProfileMode(2)}
                />{' '}
                <u>Plausible Deniability Profile</u>
              </label>
              <br />
              Learn more about standard and plausible deniability profile{' '}
              <a href="https://docs.crp.to/features.html#self-destruct" target="_blank" rel="noreferrer">
                here
              </a>
              .
              <p>
                DISCLAIMER &mdash; I understand that there is no way to recover my PIN, and, if I forget my PIN, the
                only way to recover my OnlyKey is to perform a factory reset which wipes all sensitive information.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={passcode3Disclaimer}
                  onChange={(e) => setPasscode3Disclaimer(e.target.checked)}
                />{' '}
                I understand and accept the above risk.
              </label>
              <p>
                Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [Next] below.
              </p>
            </>
          ) : (
            <>
              <h3>Enter PIN for Second Profile on OnlyKey Keypad</h3>
              <p>
                Your OnlyKey is now set up to store 12 accounts and is ready to use! OnlyKey permits adding a second
                profile to store an additonal 12 accounts (24 total). Set a second PIN to access the second profile.
                Second profile must be configured during initial setup and cannot be set up later.
                <br />
                <br />
                <SetButton onClick={() => setClassicStep('Step6')}>
                  <b>I don&apos;t want a second profile, skip this step</b>
                </SetButton>
              </p>
              <p>
                DISCLAIMER &mdash; I understand that there is no way to recover my PIN, and, if I forget my PIN, the
                only way to recover my OnlyKey is to perform a factory reset which wipes all sensitive information.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={passcode3Disclaimer}
                  onChange={(e) => setPasscode3Disclaimer(e.target.checked)}
                />{' '}
                I understand and accept the above risk.
              </label>
              <p>
                Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [Next] below.
              </p>
            </>
          )}
        </div>
      )}

      {classicStep === 'Step5' && (
        <div id="Step5">
          <h3>Re-enter PIN for Second Profile on OnlyKey Keypad</h3>
          <p>
            Re-enter the 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [Next] below.
          </p>
        </div>
      )}

      {classicStep === 'Step6' && (
        <div id="Step6">
          {isInitialized ? (
            <>
              <h3>Change Self-Destruct PIN</h3>
              <p>
                OnlyKey permits adding a self-destruct PIN that when entered will restore the OnlyKey to factory default
                settings. This is a helpful way to quickly wipe the OnlyKey. Alternatively, entering 10 incorrect PIN codes
                will wipe the OnlyKey.
              </p>
              <br />
              <p>
                WARNING &mdash; Make sure to choose a PIN that is not similar to your profile PINs as this could result
                in unintentionally wiping your OnlyKey.
              </p>
              <p>
                DISCLAIMER &mdash; I understand that entering this PIN will cause OnlyKey to perform a factory default
                which wipes all sensitive information.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={passcode2Disclaimer}
                  onChange={(e) => setPasscode2Disclaimer(e.target.checked)}
                />{' '}
                I understand and accept the above risk.
              </label>
              <p>
                Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [Next] below.
              </p>
            </>
          ) : (
            <>
              <h3>Enter Self-Destruct PIN on OnlyKey Keypad</h3>
              <p>
                Your OnlyKey is now set up to store 24 accounts and is ready to use! OnlyKey permits adding a
                self-destruct PIN that when entered will restore the OnlyKey to factory default settings. This is a
                helpful way to quickly wipe the OnlyKey. Alternatively, entering 10 incorrect PIN codes will wipe the
                OnlyKey.
              </p>
              <SetButton onClick={() => setClassicStep('Step8')}>
                <b>I don&apos;t want a self-destruct PIN, skip this step</b>
              </SetButton>
              <br />
              <br />
              <p>
                WARNING &mdash; Make sure to choose a PIN that is not similar to your profile PINs as this could result
                in unintentionally wiping your OnlyKey.
              </p>
              <p>
                DISCLAIMER &mdash; I understand that entering this PIN will cause OnlyKey to perform a factory default
                which wipes all sensitive information.
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={passcode2Disclaimer}
                  onChange={(e) => setPasscode2Disclaimer(e.target.checked)}
                />{' '}
                I understand and accept the above risk.
              </label>
              <p>
                Enter a 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [Next] below.
              </p>
            </>
          )}
        </div>
      )}

      {classicStep === 'Step7' && (
        <div id="Step7">
          <h3>Re-enter Self-Destruct PIN on OnlyKey Keypad</h3>
          <p>
            Re-enter the 7 - 10 digit PIN on your OnlyKey six-button keypad. When you are finished, click [Next] below.
          </p>
        </div>
      )}

      {classicStep === 'Step8' && (
        <BackupPassphraseStep
          isInitialized={isInitialized}
          advancedSetup={advancedSetup}
          backupKeyMode={backupKeyMode}
          onBackupKeyModeChange={setBackupKeyMode}
          backupPassphrase={backupPassphrase}
          backupConfirm={backupConfirm}
          onPassphraseChange={setBackupPassphrase}
          onConfirmChange={setBackupConfirm}
          configHint={isInitialized ? configModePassphraseHint(deviceType) : undefined}
          onUsePgpKey={() => setClassicStep('Step9')}
        />
      )}

      {classicStep === 'Step9' && (
        <PgpBackupKeyStep
          pgpSlot={pgpSlot}
          onSlotChange={setPgpSlot}
          pgpKey={pgpKey}
          onKeyChange={setPgpKey}
          pgpPasscode={pgpPasscode}
          onPasscodeChange={setPgpPasscode}
          pgpSetAsSignature={pgpSetAsSignature}
          onSetAsSignatureChange={setPgpSetAsSignature}
          pgpBackupKeyMode={pgpBackupKeyMode}
          onBackupKeyModeChange={setPgpBackupKeyMode}
          configHint={isInitialized ? configModePassphraseHint(deviceType) : undefined}
          onUsePassphrase={() => setClassicStep('Step8')}
        />
      )}

      {classicStep === 'Step10' && (
        <RestoreStep inputRef={restoreInputRef} onFile={handleRestore} />
      )}

      {classicStep === 'Step11' && (
        <FirmwareStep inputRef={firmwareInputRef} onFile={handleFirmware} />
      )}

      {classicStep === 'Step1' && <StepNav showGuided onNext={startGuided} />}

      {classicStep === 'Step2' && (
        <StepNav
          onNext={() =>
            run(async () => {
              if (!passcode1Disclaimer) throw new Error('Please accept the disclaimer.');
              await device!.beginClassicPinEntry('pin');
              if (guided) setClassicStep('Step3');
              else resetToStep1();
            })
          }
          onCancel={resetToStep1}
          nextDisabled={!passcode1Disclaimer}
        />
      )}

      {classicStep === 'Step3' && (
        <StepNav
          onNext={() =>
            run(async () => {
              await device!.beginClassicPinEntry('pin');
              if (guided) setClassicStep('Step4');
              else resetToStep1();
            })
          }
          onCancel={resetToStep1}
        />
      )}

      {classicStep === 'Step4' && (
        <StepNav
          onNext={() =>
            run(async () => {
              if (!isInitialized && !passcode3Disclaimer) throw new Error('Please accept the disclaimer.');
              if (!isInitialized && advancedSetup) await device!.setSecProfileMode(secProfileMode);
              await device!.beginClassicPinEntry('pin2');
              if (guided) setClassicStep('Step5');
              else resetToStep1();
            })
          }
          onCancel={resetToStep1}
          nextDisabled={!isInitialized && !passcode3Disclaimer}
        />
      )}

      {classicStep === 'Step5' && (
        <StepNav
          onNext={() =>
            run(async () => {
              await device!.beginClassicPinEntry('pin2');
              if (guided) setClassicStep('Step6');
              else resetToStep1();
            })
          }
          onCancel={resetToStep1}
        />
      )}

      {classicStep === 'Step6' && (
        <StepNav
          onNext={() =>
            run(async () => {
              if (!passcode2Disclaimer && (isInitialized || guided)) {
                throw new Error('Please accept the disclaimer.');
              }
              await device!.beginClassicPinEntry('sdpin');
              if (guided) setClassicStep('Step7');
              else resetToStep1();
            })
          }
          onCancel={resetToStep1}
          nextDisabled={!passcode2Disclaimer && (isInitialized || guided)}
        />
      )}

      {classicStep === 'Step7' && (
        <StepNav
          onNext={() =>
            run(async () => {
              await device!.beginClassicPinEntry('sdpin');
              if (guided) setClassicStep('Step8');
              else resetToStep1();
            })
          }
          onCancel={resetToStep1}
        />
      )}

      {classicStep === 'Step8' && (
        <StepNav onNext={handleBackup} onCancel={resetToStep1} />
      )}

      {classicStep === 'Step9' && (
        <StepNav onNext={handlePgpImport} onCancel={resetToStep1} nextLabel="Next" />
      )}

      {classicStep === 'Step10' && (
        <StepNav
          onNext={() => restoreInputRef.current?.click()}
          onCancel={resetToStep1}
        />
      )}

      {classicStep === 'Step11' && (
        <StepNav
          onNext={() => firmwareInputRef.current?.click()}
          onCancel={resetToStep1}
          nextLabel="Load Firmware to OnlyKey"
        />
      )}

      <PrivateKeySelectDialog
        open={showPgpKeySelect}
        candidates={pgpCandidates}
        onClose={() => setShowPgpKeySelect(false)}
        onConfirm={(candidateId: string, slot: number) => loadPgpBackupKey(candidateId, slot)}
      />
    </SetupShell>
  );
};

const BackupPassphraseStep: React.FC<{
  isInitialized: boolean;
  advancedSetup: boolean;
  backupKeyMode: number;
  onBackupKeyModeChange: (v: number) => void;
  backupPassphrase: string;
  backupConfirm: string;
  onPassphraseChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  configHint?: string;
  onUsePgpKey?: () => void;
}> = ({
  isInitialized,
  advancedSetup,
  backupKeyMode,
  onBackupKeyModeChange,
  backupPassphrase,
  backupConfirm,
  onPassphraseChange,
  onConfirmChange,
  configHint,
  onUsePgpKey,
}) => (
  <div id="Step8">
    <h3>Enter a Backup Passphrase</h3>
    {configHint && <p>{configHint}</p>}
    <p>
      Your passphrase will be used for secure backup and restore of your OnlyKey so make sure to choose a good one, write
      it down, and store it in a secure location.
    </p>
    <p>Example of a <em>good</em> passphrase: &apos;this passphrase is not complex but it is long and it is not a common phrase&apos;</p>
    <p>Example of a <em>bad</em> passphrase: &apos;the only thing we have to fear is fear itself&apos;</p>
    <br />
    <label className="block">
      <b>Enter Passphrase:</b>
      <input
        type="password"
        value={backupPassphrase}
        onChange={(e) => onPassphraseChange(e.target.value)}
        className="field-input mt-1 block max-w-xl"
        autoComplete="new-password"
      />
      <span className="mt-1 block text-sm text-muted">Passphrase must be at least 25 characters</span>
    </label>
    <br />
    <label className="block">
      <b>Re-Enter Passphrase:</b>
      <input
        type="password"
        value={backupConfirm}
        onChange={(e) => onConfirmChange(e.target.value)}
        className="field-input mt-1 block max-w-xl"
        autoComplete="new-password"
      />
    </label>
    {!isInitialized && advancedSetup && (
      <>
        <br />
        <br />
        <label>
          <input
            type="radio"
            checked={backupKeyMode === 0}
            onChange={() => onBackupKeyModeChange(0)}
          />{' '}
          <u>Permit future backup key changes (Default)</u>
        </label>
        <br />
        <label>
          <input
            type="radio"
            checked={backupKeyMode === 1}
            onChange={() => onBackupKeyModeChange(1)}
          />{' '}
          <u>Lock backup key on this device</u>
        </label>
      </>
    )}
    <br />
    Learn more about secure backup{' '}
    <a href="https://docs.crp.to/usersguide.html#secure-encrypted-backup-anywhere" target="_blank" rel="noreferrer">
      here
    </a>
    .
    {onUsePgpKey && (
      <>
        <br />
        <br />
        <SetButton onClick={onUsePgpKey}>
          <b>Use OpenPGP key instead of passphrase</b>
        </SetButton>
      </>
    )}
  </div>
);

const PgpBackupKeyStep: React.FC<{
  pgpSlot: number;
  onSlotChange: (v: number) => void;
  pgpKey: string;
  onKeyChange: (v: string) => void;
  pgpPasscode: string;
  onPasscodeChange: (v: string) => void;
  pgpSetAsSignature: boolean;
  onSetAsSignatureChange: (v: boolean) => void;
  pgpBackupKeyMode: number;
  onBackupKeyModeChange: (v: number) => void;
  configHint?: string;
  onUsePassphrase: () => void;
}> = ({
  pgpSlot,
  onSlotChange,
  pgpKey,
  onKeyChange,
  pgpPasscode,
  onPasscodeChange,
  pgpSetAsSignature,
  onSetAsSignatureChange,
  pgpBackupKeyMode,
  onBackupKeyModeChange,
  configHint,
  onUsePassphrase,
}) => (
  <div id="Step9">
    <h3>Set a Backup Key</h3>
    {configHint && <p>{configHint}</p>}
    <p>
      Your OpenPGP key will be used for secure backup and restore of your OnlyKey, make sure to store it in a
      secure location.
    </p>
    <p>
      Need a key? Follow our guide{' '}
      <a href="https://docs.crp.to/importpgp.html#generating-keys" target="_blank" rel="noreferrer">
        here
      </a>{' '}
      for generating an OpenPGP key.
    </p>
    <label>
      Slot:{' '}
      <select value={pgpSlot} onChange={(e) => onSlotChange(parseInt(e.target.value, 10))}>
        {BACKUP_RSA_SLOTS.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    </label>
    <br />
    <br />
    <label className="block">
      Backup OpenPGP RSA/ECC Key:
      <textarea
        value={pgpKey}
        onChange={(e) => onKeyChange(e.target.value)}
        rows={3}
        placeholder="OpenPGP Key -- paste PEM file contents"
        className="field-input mt-1 font-mono text-sm w-full max-w-2xl"
      />
    </label>
    <br />
    <label className="block">
      Passphrase:
      <input
        type="password"
        value={pgpPasscode}
        onChange={(e) => onPasscodeChange(e.target.value)}
        className="field-input mt-1 block max-w-xl"
        autoComplete="new-password"
      />
    </label>
    <br />
    <br />
    <label>
      <input
        type="checkbox"
        checked={pgpSetAsSignature}
        onChange={(e) => onSetAsSignatureChange(e.target.checked)}
      />{' '}
      Set as signature key - Use key to sign messages
    </label>
    <br />
    <br />
    <label>
      <input
        type="radio"
        checked={pgpBackupKeyMode === 0}
        onChange={() => onBackupKeyModeChange(0)}
      />{' '}
      <u>Permit future backup key changes (Default)</u>
    </label>
    <br />
    <label>
      <input
        type="radio"
        checked={pgpBackupKeyMode === 1}
        onChange={() => onBackupKeyModeChange(1)}
      />{' '}
      <u>Lock backup key on this device</u>
    </label>
    <br />
    <br />
    <SetButton onClick={onUsePassphrase}>
      <b>Use passphrase instead of PGP key</b>
    </SetButton>
  </div>
);

const RestoreStep: React.FC<{
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}> = ({ inputRef, onFile }) => (
  <div id="Step10">
    <h3>Restore from Backup</h3>
    <StepFieldset>
      To restore a backup file to your OnlyKey, ensure you have loaded the same backup passphrase or backup key you used
      to create the backup.
      <p>Click [Choose File], select your backup file, then click [Next].</p>
      <p>
        Restore can take up to 1 minute to complete, your OnlyKey will automatically reboot when restoring is complete.
      </p>
      <p>
        If you do not have a backup file to restore then setup is complete, you may remove and reinsert your OnlyKey now.
      </p>
    </StepFieldset>
    <input
      ref={inputRef}
      type="file"
      accept=".txt,.okb"
      className="hidden"
      onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
    />
    <input
      type="file"
      accept=".txt,.okb"
      onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
    />
  </div>
);

const FirmwareStep: React.FC<{
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File) => void;
}> = ({ inputRef, onFile }) => (
  <div id="Step11">
    <h2>Load Firmware</h2>
    To load new firmware file to your OnlyKey, click [Choose File], select your firmware file, then click [Load Firmware
    to OnlyKey].
    <p>
      The OnlyKey will restart automatically when firmware load is complete.
      <br />
      <br />
      <input
        ref={inputRef}
        type="file"
        accept=".okfw,.txt,.hex"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <input
        type="file"
        accept=".okfw,.txt,.hex"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
    </p>
  </div>
);

export default Setup;