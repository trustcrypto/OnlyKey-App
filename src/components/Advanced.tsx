import React, { useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { KEY_SLOTS } from '../api/device/keyParser';
import { hexStringToByteArray } from '../api/device/utils';
import { CONFIG_MODE_REQUIRED, configModeTooltipText } from '../data/configMode';
import { CautionButton, CriticalText, SetButton } from './ui/forms';
import { Tooltip } from './ui/Tooltip';

const ECC_TYPES = [
  { value: 1, label: 'Curve25519/Ed25519' },
  { value: 2, label: 'NIST256P1' },
  { value: 3, label: 'SECP256K1' },
  { value: 9, label: 'HMACSHA1' },
];

const ECC_SLOTS = [
  ...KEY_SLOTS.ecc.map((s) => ({ value: s, label: `ECC ${s - 100} (${s})` })),
  { value: 129, label: 'HMAC 2 (129)' },
  { value: 130, label: 'HMAC 1 (130)' },
];

const KEY_MODIFIERS = { Backup: 128, Signature: 64, Decryption: 32 };

const Advanced: React.FC = () => {
  const { device, deviceType, isConfigMode, setWorking } = useDeviceStore();
  const [yubiForm, setYubiForm] = useState({ publicId: '', privateId: '', secretKey: '' });
  const [eccType, setEccType] = useState(1);
  const [eccSlot, setEccSlot] = useState(101);
  const [eccKey, setEccKey] = useState('');
  const [eccModifiers, setEccModifiers] = useState({ Backup: false, Signature: false, Decryption: false });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (!device) return null;

  const requireConfigMode = (): boolean => {
    if (isConfigMode) return true;
    setStatus(null);
    setError(CONFIG_MODE_REQUIRED);
    return false;
  };

  return (
    <div className="page-shell">
      <header className="page-header">
        <h2 className="text-xl font-bold">Advanced</h2>
      </header>
      <div className="page-body page-body--scroll content-panel">
        <hr className="advanced-divider" />
        <div className="advanced-panel">
          <form className="advanced-block" onSubmit={(e) => e.preventDefault()}>
            <h3>Add Yubikey Security Info (Legacy)</h3>
            <div className="advanced-yubi-row">
              <input
                type="text"
                value={yubiForm.publicId}
                onChange={(e) => setYubiForm({ ...yubiForm, publicId: e.target.value })}
                placeholder="Public id"
                maxLength={17}
                className="field-input"
              />
              <input
                type="text"
                value={yubiForm.privateId}
                onChange={(e) => setYubiForm({ ...yubiForm, privateId: e.target.value })}
                placeholder="Private id"
                maxLength={17}
                className="field-input"
              />
              <input
                type="text"
                value={yubiForm.secretKey}
                onChange={(e) => setYubiForm({ ...yubiForm, secretKey: e.target.value })}
                placeholder="Secret aes key"
                maxLength={47}
                className="field-input"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <SetButton
                onClick={async () => {
                  setError(null);
                  setStatus(null);
                  const { publicId, privateId, secretKey } = yubiForm;
                  if (!publicId || !privateId || !secretKey) {
                    setError('All Yubikey fields are required.');
                    return;
                  }
                  setWorking(true, 'Saving Yubikey security info…');
                  try {
                    await device.setYubiAuth(publicId, privateId, secretKey);
                    setYubiForm({ publicId: '', privateId: '', secretKey: '' });
                    setStatus('Yubikey security info saved to OnlyKey.');
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Save to OnlyKey
              </SetButton>
              <CautionButton
                onClick={async () => {
                  if (!window.confirm('Wipe Yubikey security info from OnlyKey?')) return;
                  setError(null);
                  setStatus(null);
                  setWorking(true, 'Wiping Yubikey security info…');
                  try {
                    await device.wipeYubiAuth();
                    setStatus('Yubikey security info wiped from OnlyKey.');
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Wipe from OnlyKey
              </CautionButton>
            </div>
          </form>

          <hr className="advanced-divider" />

          <form className="advanced-block" onSubmit={(e) => e.preventDefault()}>
            <h3>Add Private Key</h3>
            <CriticalText>
              Before saving or wiping a private key, put your OnlyKey into{' '}
              <Tooltip text={configModeTooltipText(deviceType)} className="tooltip-trigger--inline-term">
                <span className="tooltip-inline-term">config mode</span>
              </Tooltip>
              .
            </CriticalText>
            <div className="advanced-meta-row">
              <label>
                Type
                <select
                  value={eccType}
                  onChange={(e) => setEccType(parseInt(e.target.value, 10))}
                  className="field-input field-select-compact"
                >
                  {ECC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Slot
                <select
                  value={eccSlot}
                  onChange={(e) => setEccSlot(parseInt(e.target.value, 10))}
                  className="field-input field-select-compact"
                >
                  {ECC_SLOTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="advanced-key-area block">
              Key
              <textarea
                value={eccKey}
                onChange={(e) => setEccKey(e.target.value)}
                placeholder="Private Key (ECC - 32 bytes hex, HMACSHA1 - 20 bytes hex)"
                className="field-input mt-1 font-mono w-full"
              />
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={eccModifiers.Backup}
                onChange={(e) => setEccModifiers({ ...eccModifiers, Backup: e.target.checked })}
                className="ok-control"
              />
              Set as backup key (only one backup may be set)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={eccModifiers.Signature}
                onChange={(e) => setEccModifiers({ ...eccModifiers, Signature: e.target.checked })}
                className="ok-control"
              />
              Set as signature key
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={eccModifiers.Decryption}
                onChange={(e) => setEccModifiers({ ...eccModifiers, Decryption: e.target.checked })}
                className="ok-control"
              />
              Set as decryption key
            </label>
            <div className="flex flex-wrap gap-2">
              <SetButton
                onClick={async () => {
                  setError(null);
                  setStatus(null);
                  if (!requireConfigMode()) return;
                  const maxLen = eccType === 9 ? 40 : 64;
                  const key = eccKey.replace(/\s/g, '').slice(0, maxLen);
                  if (!key || key.length !== maxLen) {
                    setError(`${eccType === 9 ? 'HMAC' : 'ECC'} key must be ${maxLen} hex characters.`);
                    return;
                  }
                  let type = eccType;
                  Object.entries(eccModifiers).forEach(([name, checked]) => {
                    if (checked) type += KEY_MODIFIERS[name as keyof typeof KEY_MODIFIERS];
                  });
                  setWorking(true, 'Saving private key…');
                  try {
                    await device.setPrivateKey(eccSlot, type, hexStringToByteArray(key));
                    setEccKey('');
                    setStatus(`Private key saved to slot ${eccSlot}.`);
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Save to OnlyKey
              </SetButton>
              <CautionButton
                onClick={async () => {
                  if (!window.confirm(`Wipe private key from slot ${eccSlot}?`)) return;
                  setError(null);
                  setStatus(null);
                  if (!requireConfigMode()) return;
                  setWorking(true, `Wiping private key from slot ${eccSlot}…`);
                  try {
                    await device.wipePrivateKey(eccSlot);
                    setStatus(`Private key wiped from slot ${eccSlot}.`);
                  } catch (e: unknown) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                Wipe from OnlyKey
              </CautionButton>
            </div>
          </form>
        </div>
        {status && <p className="status-success mt-2">{status}</p>}
        {error && <p className="critical-text mt-2">{error}</p>}
      </div>
    </div>
  );
};

export default Advanced;