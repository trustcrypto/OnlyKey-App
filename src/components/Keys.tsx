import React, { useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { KEY_SLOTS } from '../api/device/keyParser';
import { parseKeyBundle } from '../services/keyImport/keyBundleParser';
import { importPemKey, isSelectionRequiredError, KeyCandidate } from '../services/keyImport/keyImportService';
import { wipeKeyInSlot } from '../services/keys/keyService';
import PrivateKeySelectDialog from './dialogs/PrivateKeySelectDialog';
import ConfigModeInstructions from './ConfigModeInstructions';
import { CautionButton, SetButton } from './ui/forms';

const RSA_SLOT_OPTIONS = [
  { value: 99, label: 'Auto Load' },
  ...KEY_SLOTS.rsa.map((s) => ({ value: s, label: `RSA ${s}` })),
  ...KEY_SLOTS.ecc.map((s) => ({ value: s, label: `ECC ${s - 100} (${s})` })),
];

const Keys: React.FC = () => {
  const { device } = useDeviceStore();
  const [slot, setSlot] = useState(99);
  const [pemKey, setPemKey] = useState('');
  const [passcode, setPasscode] = useState('');
  const [setAsBackup, setSetAsBackup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyCandidates, setKeyCandidates] = useState<KeyCandidate[]>([]);
  const [showKeySelect, setShowKeySelect] = useState(false);

  const loadPemWithOptions = async (selectedCandidateId?: string, targetSlot?: number) => {
    if (!device || !pemKey.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      await importPemKey(device, {
        pem: pemKey.trim(),
        passcode,
        slotChoice: slot,
        setAsBackup,
        selectedCandidateId,
        targetSlot,
      });
      setPemKey('');
      setPasscode('');
      setShowKeySelect(false);
      setKeyCandidates([]);
    } catch (e: unknown) {
      if (isSelectionRequiredError(e)) {
        const bundle = await parseKeyBundle(pemKey.trim(), passcode, slot);
        setKeyCandidates(bundle.candidates);
        setShowKeySelect(true);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!device) return null;

  return (
    <div className="page-shell">
      <header className="page-header">
        <h2>Keys</h2>
      </header>
      <div className="page-body page-body--scroll content-panel">
        <div className="keys-page space-y-5">
          <div className="keys-instructions space-y-4">
            <p>
              Load OpenPGP or OpenSSH keys onto your OnlyKey. Keys can be used with{' '}
              <a href="https://docs.crp.to/onlykey-agent.html" target="_blank" rel="noreferrer">
                OnlyKey Agent
              </a>{' '}
              and{' '}
              <a href="https://docs.crp.to/webcrypt.html" target="_blank" rel="noreferrer">
                OnlyKey Webcrypt
              </a>
              .
            </p>
            <p>
              Need an OpenPGP key? Follow our guide{' '}
              <a href="https://docs.crp.to/importpgp.html#generating-keys" target="_blank" rel="noreferrer">
                here
              </a>{' '}
              for generating an OpenPGP key with Keybase.
            </p>
            <ConfigModeInstructions />
          </div>

          <form className="keys-form space-y-5" onSubmit={(e) => e.preventDefault()}>
            <PrivateKeySelectDialog
              open={showKeySelect}
              candidates={keyCandidates}
              onClose={() => { setShowKeySelect(false); setKeyCandidates([]); }}
              onConfirm={(id, s) => loadPemWithOptions(id, s)}
            />
            <h3>Load Private Key (PEM Format OpenPGP or OpenSSH)</h3>

            <div className="keys-slot-pass-row">
              <label className="keys-field">
                <span className="font-semibold text-secondary">Slot</span>
                <select
                  value={slot}
                  onChange={(e) => setSlot(parseInt(e.target.value, 10))}
                  className="field-input mt-1"
                >
                  {RSA_SLOT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="keys-field">
                <span className="font-semibold text-secondary">Passphrase</span>
                <input
                  type="password"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  className="field-input mt-1"
                />
              </label>
            </div>

            <label className="block">
              <span className="font-semibold text-secondary">Key</span>
              <textarea
                rows={5}
                value={pemKey}
                onChange={(e) => setPemKey(e.target.value)}
                placeholder="OpenPGP or OpenSSH Key — paste PEM file contents"
                className="field-input mt-1 font-mono text-sm w-full"
              />
            </label>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={setAsBackup} onChange={(e) => setSetAsBackup(e.target.checked)} className="ok-control" />
              <span>Set as backup key</span>
            </label>
            <p className="text-muted text-sm">
              (This setting uses the above key for secure backups instead of any backup passphrase you might have set earlier.)
            </p>
            <div className="flex flex-wrap gap-2">
              <SetButton disabled={isLoading || !pemKey.trim()} onClick={() => loadPemWithOptions()}>
                Save to OnlyKey
              </SetButton>
              <CautionButton
                disabled={isLoading}
                onClick={async () => {
                  if (!window.confirm(`Wipe key in slot ${slot === 99 ? 1 : slot}?`)) return;
                  setIsLoading(true);
                  try {
                    await wipeKeyInSlot(device, slot);
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setIsLoading(false);
                  }
                }}
              >
                Wipe from OnlyKey
              </CautionButton>
            </div>
            {error && <p className="critical-text">{error}</p>}
          </form>
        </div>
      </div>
    </div>
  );
};

export default Keys;