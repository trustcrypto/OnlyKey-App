import React, { useEffect, useState } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { DeviceType } from '../api/device/types';
import {
  saveSlotConfig,
  validateDuoNoPinSlot,
  wipeSlotData,
  type SlotFormState,
} from '../services/slot/slotConfigService';
import {
  NEXTKEY_AFTER_FIELD_OPTIONS,
  NEXTKEY_BEFORE_FIELD_OPTIONS,
  NEXTKEY_AFTER_OTP_OPTIONS,
} from '../api/device/firmwareConstants';
import {
  getLastSlotConfigMode,
  setLastSlotConfigMode,
  type SlotConfigMode,
} from '../utils/slotEditorPrefs';
import PasswordGeneratorDialog from './dialogs/PasswordGeneratorDialog';
import ConfirmDialog from './dialogs/ConfirmDialog';
import { PseudoTabBar } from './ui/PseudoTabs';

const INPUT = 'field-input';
const TEXT = `${INPUT} slot-input-text`;
const NARROW = `${INPUT} slot-input-narrow`;
const SPEED = `${INPUT} slot-input-speed`;

const DEFAULT_FORM: SlotFormState = {
  label: '', url: '', username: '', password: '', passwordConfirm: '',
  delay1: '0', delay2: '0', delay3: '0',
  nextKey4: '0', nextKey1: '0', nextKey2: '0', nextKey5: '0', nextKey3: '0',
  slotTypeSpeed: '4', mfaMode: 'none', totpSecret: '',
  yubiPublicId: '', yubiPrivateId: '', yubiSecretKey: '',
};

const DEFAULT_ENABLED: Record<string, boolean> = {
  label: true, url: false, username: false, password: false,
  delay1: false, delay2: false, delay3: false,
  nextKey4: false, nextKey1: false, nextKey2: false, nextKey5: false, nextKey3: false,
  slotTypeSpeed: false, mfa: false, totp: false,
};

const SlotEditor: React.FC = () => {
  const {
    selectedSlotId,
    setSelectedSlot,
    device,
    deviceType,
    devicePinSet,
    labels,
    refreshLabels,
    setWorking,
  } = useDeviceStore();

  const [configMode, setConfigMode] = useState<SlotConfigMode>(getLastSlotConfigMode);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showWipeConfirm, setShowWipeConfirm] = useState(false);
  const [showPasswordGen, setShowPasswordGen] = useState(false);
  const [form, setForm] = useState<SlotFormState>(DEFAULT_FORM);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(DEFAULT_ENABLED);

  const isDuoNoPin = deviceType === DeviceType.DUO && !devicePinSet;
  const tabModes: SlotConfigMode[] = isDuoNoPin ? ['basic', 'mfa'] : ['basic', 'mfa', 'advanced'];

  const selectConfigMode = (mode: SlotConfigMode) => {
    setConfigMode(mode);
    setLastSlotConfigMode(mode);
  };

  useEffect(() => {
    if (selectedSlotId === null) return;
    const existing = labels[selectedSlotId];
    setForm({
      ...DEFAULT_FORM,
      label: existing && existing.toLowerCase() !== 'empty' ? existing : '',
    });
    setEnabled({ ...DEFAULT_ENABLED });
    setError(null);
    // Reset only when the selected slot changes. A labels refresh must not
    // wipe in-progress checkbox/delay edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlotId]);

  if (selectedSlotId === null || !device) return null;

  const update = (key: keyof SlotFormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setWorking(true, 'Saving slot configuration…');

    try {
      validateDuoNoPinSlot(deviceType, devicePinSet, enabled, form);
      await saveSlotConfig(device, selectedSlotId, enabled, form);
      await refreshLabels();
      setSelectedSlot(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setIsSaving(false);
      setWorking(false);
    }
  };

  const handleWipe = async () => {
    setShowWipeConfirm(false);
    setIsSaving(true);
    setWorking(true, 'Wiping slot…');
    try {
      await wipeSlotData(device, selectedSlotId);
      await refreshLabels();
      setSelectedSlot(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Wipe failed.');
    } finally {
      setIsSaving(false);
      setWorking(false);
    }
  };

  const tabLabel = (mode: SlotConfigMode) => {
    if (mode === 'mfa') return 'Multi-factor';
    if (mode === 'advanced') return 'Full Configuration (Advanced)';
    return isDuoNoPin ? 'Static Password' : 'Basic Login';
  };

  return (
    <div
      data-testid="slot-editor"
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm"
    >
      <PasswordGeneratorDialog
        open={showPasswordGen}
        onClose={() => setShowPasswordGen(false)}
        onApply={(pw) => {
          setForm((f) => ({ ...f, password: pw, passwordConfirm: pw }));
          setEnabled((s) => ({ ...s, password: true }));
        }}
      />
      <ConfirmDialog
        open={showWipeConfirm}
        title="Wipe Slot"
        message={`Permanently wipe all data in slot ${selectedSlotId}? This cannot be undone.`}
        confirmLabel="Wipe Slot"
        variant="danger"
        onConfirm={handleWipe}
        onCancel={() => setShowWipeConfirm(false)}
      />

      <div
        className={`slot-editor-card bg-ok-gray rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden ${
          configMode === 'advanced' && !isDuoNoPin ? 'slot-editor-card--advanced' : ''
        }`}
      >
        <div className="px-4 py-2 border-b border-white/5 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold">OnlyKey Slot {selectedSlotId} Configuration</h2>
          <button
            type="button"
            onClick={() => setSelectedSlot(null)}
            className="text-sm text-muted hover:text-secondary px-2 py-1"
          >
            close ✕
          </button>
        </div>

        {isDuoNoPin && (
          <p className="mx-4 mt-2 text-amber-300/90 text-xs bg-amber-500/10 px-3 py-1 rounded shrink-0">
            Duo without PIN: static password <em>or</em> MFA per slot — not both.
          </p>
        )}

        <div className="slot-editor-tabs shrink-0 px-4">
          <PseudoTabBar
            tabs={tabModes.map((mode) => ({ id: mode, label: tabLabel(mode) }))}
            active={configMode}
            onChange={(id) => selectConfigMode(id as SlotConfigMode)}
          />
        </div>

        <form onSubmit={handleSave} className="flex flex-col min-h-0 flex-1 px-4 py-2 overflow-hidden max-h-full">
          <p className="text-sm text-muted shrink-0 mb-2">Check the box next to the fields you want to set</p>

          {configMode === 'advanced' && !isDuoNoPin ? (
            <div className="slot-editor-advanced-cols min-h-0 overflow-hidden flex-1">
              <div className="slot-editor-body">
                <SlotRow id="label" label="Label (up to 16 chars)" enabled={enabled} setEnabled={setEnabled}>
                  <input
                    value={form.label}
                    onChange={(e) => update('label', e.target.value)}
                    className={TEXT}
                    maxLength={16}
                    placeholder="e.g. GitHub"
                  />
                </SlotRow>
                <SlotRow id="url" label="URL (up to 56 chars)" enabled={enabled} setEnabled={setEnabled}>
                  <input
                    value={form.url}
                    onChange={(e) => update('url', e.target.value)}
                    className={TEXT}
                    maxLength={56}
                    placeholder="https://..."
                  />
                </SlotRow>
                <DelayRow id="delay1" context="after URL" form={form} update={update} enabled={enabled} setEnabled={setEnabled} />
                <RadioRow
                  id="nextKey4"
                  label="Tab before UserName"
                  field="nextKey4"
                  form={form}
                  update={update}
                  enabled={enabled}
                  setEnabled={setEnabled}
                  options={NEXTKEY_BEFORE_FIELD_OPTIONS}
                />
                <SlotRow id="username" label="UserName (up to 56 chars)" enabled={enabled} setEnabled={setEnabled}>
                  <input
                    value={form.username}
                    onChange={(e) => update('username', e.target.value)}
                    className={TEXT}
                    maxLength={56}
                  />
                </SlotRow>
                <RadioRow
                  id="nextKey1"
                  label="After UserName"
                  field="nextKey1"
                  form={form}
                  update={update}
                  enabled={enabled}
                  setEnabled={setEnabled}
                  options={NEXTKEY_AFTER_FIELD_OPTIONS}
                />
                <DelayRow id="delay2" context="after username" form={form} update={update} enabled={enabled} setEnabled={setEnabled} />
                <PasswordRow
                  form={form}
                  update={update}
                  enabled={enabled}
                  setEnabled={setEnabled}
                  onGenerate={() => setShowPasswordGen(true)}
                  compact
                />
                <RadioRow
                  id="nextKey2"
                  label="After Password"
                  field="nextKey2"
                  form={form}
                  update={update}
                  enabled={enabled}
                  setEnabled={setEnabled}
                  options={NEXTKEY_AFTER_FIELD_OPTIONS}
                />
                <TypeSpeedRow form={form} update={update} enabled={enabled} setEnabled={setEnabled} />
              </div>
              <div className="slot-editor-body">
                <MfaFields form={form} update={update} enabled={enabled} setEnabled={setEnabled} />
              </div>
            </div>
          ) : (
          <div className="slot-editor-body min-h-0 overflow-hidden flex-1">
            <SlotRow id="label" label="Label (up to 16 chars)" enabled={enabled} setEnabled={setEnabled}>
              <input
                value={form.label}
                onChange={(e) => update('label', e.target.value)}
                className={TEXT}
                maxLength={16}
                placeholder="e.g. GitHub"
              />
            </SlotRow>

            {configMode === 'basic' && (
              <>
                {!isDuoNoPin && (
                  <>
                    <SlotRow id="username" label="UserName (up to 56 chars)" enabled={enabled} setEnabled={setEnabled}>
                      <input
                        value={form.username}
                        onChange={(e) => update('username', e.target.value)}
                        className={TEXT}
                        maxLength={56}
                      />
                    </SlotRow>
                    <RadioRow
                      id="nextKey1"
                      label="After UserName"
                      field="nextKey1"
                      form={form}
                      update={update}
                      enabled={enabled}
                      setEnabled={setEnabled}
                      options={NEXTKEY_AFTER_FIELD_OPTIONS}
                    />
                  </>
                )}
                <PasswordRow
                  form={form}
                  update={update}
                  enabled={enabled}
                  setEnabled={setEnabled}
                  onGenerate={() => setShowPasswordGen(true)}
                  compact={false}
                />
                {!isDuoNoPin && (
                  <RadioRow
                    id="nextKey2"
                    label="After Password"
                    field="nextKey2"
                    form={form}
                    update={update}
                    enabled={enabled}
                    setEnabled={setEnabled}
                    options={NEXTKEY_AFTER_FIELD_OPTIONS}
                  />
                )}
                <TypeSpeedRow form={form} update={update} enabled={enabled} setEnabled={setEnabled} />
              </>
            )}

            {configMode === 'mfa' && (
              <MfaFields form={form} update={update} enabled={enabled} setEnabled={setEnabled} />
            )}
          </div>
          )}

          {error && (
            <p className="text-red-400 text-xs bg-red-400/10 px-3 py-1.5 rounded shrink-0 mt-2">{error}</p>
          )}

          <div className="flex items-center justify-between gap-3 pt-3 mt-2 border-t border-white/5 shrink-0">
            <button
              type="button"
              onClick={() => setShowWipeConfirm(true)}
              className="px-4 py-2 text-red-400 hover:bg-red-400/10 rounded-lg text-sm font-semibold"
            >
              Wipe All Slot Data
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedSlot(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2 bg-ok-blue hover:bg-blue-600 text-on-blue rounded-lg text-sm font-bold disabled:opacity-50 disabled:hover:bg-ok-blue transition-colors"
              >
                {isSaving ? 'Saving...' : 'Set Slot'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

const SlotRow: React.FC<{
  id: string;
  label: string;
  enabled: Record<string, boolean>;
  setEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  children: React.ReactNode;
}> = ({ id, label, enabled, setEnabled, children }) => (
  <>
    <label className="slot-editor-row-label">
      <input
        type="checkbox"
        checked={enabled[id]}
        onChange={(e) => setEnabled((s) => ({ ...s, [id]: e.target.checked }))}
        className="ok-control"
      />
      <span>{label}</span>
    </label>
    <div className="slot-editor-control">{children}</div>
  </>
);

const DelayRow: React.FC<{
  id: 'delay1' | 'delay2' | 'delay3';
  context: string;
  form: SlotFormState;
  update: (key: keyof SlotFormState, value: string) => void;
  enabled: Record<string, boolean>;
  setEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}> = ({ id, context, form, update, enabled, setEnabled }) => (
  <div className="slot-editor-inline-row">
    <label className="slot-editor-inline-label">
      <input
        type="checkbox"
        checked={enabled[id]}
        onChange={(e) => setEnabled((s) => ({ ...s, [id]: e.target.checked }))}
        className="ok-control"
      />
      <span>Delay {context}</span>
    </label>
    <input
      type="text"
      inputMode="numeric"
      maxLength={1}
      value={form[id]}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '').slice(0, 1);
        if (v === '' || (parseInt(v, 10) >= 0 && parseInt(v, 10) <= 9)) update(id, v || '0');
      }}
      className={NARROW}
      aria-label={`Delay ${context}`}
    />
    <span className="slot-editor-inline-hint">0-9 seconds</span>
  </div>
);

const PasswordRow: React.FC<{
  form: SlotFormState;
  update: (key: keyof SlotFormState, value: string) => void;
  enabled: Record<string, boolean>;
  setEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onGenerate: () => void;
  compact: boolean;
}> = ({ form, update, enabled, setEnabled, onGenerate, compact }) => (
  <SlotRow id="password" label="Password (up to 56 chars)" enabled={enabled} setEnabled={setEnabled}>
    {compact ? (
      <div className="w-full space-y-1">
        <div className="slot-editor-password-row">
          <input
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            className={TEXT}
            maxLength={56}
          />
          <input
            type="password"
            value={form.passwordConfirm}
            onChange={(e) => update('passwordConfirm', e.target.value)}
            className={TEXT}
            maxLength={56}
            placeholder="Re-enter"
          />
          <button
            type="button"
            onClick={onGenerate}
            className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 text-sm font-bold shrink-0"
          >
            Gen
          </button>
        </div>
      </div>
    ) : (
      <div className="w-full space-y-1">
        <div className="flex gap-1.5 w-full">
          <input
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            className={`${TEXT} flex-1 min-w-0`}
            maxLength={56}
          />
          <button
            type="button"
            onClick={onGenerate}
            className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/15 text-sm font-bold shrink-0"
          >
            Gen
          </button>
        </div>
        <input
          type="password"
          value={form.passwordConfirm}
          onChange={(e) => update('passwordConfirm', e.target.value)}
          className={TEXT}
          maxLength={56}
          placeholder="Re-enter Password"
        />
      </div>
    )}
  </SlotRow>
);

const TypeSpeedRow: React.FC<{
  form: SlotFormState;
  update: (key: keyof SlotFormState, value: string) => void;
  enabled: Record<string, boolean>;
  setEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}> = ({ form, update, enabled, setEnabled }) => (
  <div className="slot-editor-inline-row">
    <label className="slot-editor-inline-label">
      <input
        type="checkbox"
        checked={enabled.slotTypeSpeed}
        onChange={(e) => setEnabled((s) => ({ ...s, slotTypeSpeed: e.target.checked }))}
        className="ok-control"
      />
      <span>Keyboard Type Speed</span>
    </label>
    <input
      type="number"
      min={1}
      max={10}
      value={form.slotTypeSpeed}
      onChange={(e) => update('slotTypeSpeed', e.target.value)}
      className={SPEED}
      aria-label="Keyboard type speed"
    />
    <span className="slot-editor-inline-hint">1-10, 4=default</span>
  </div>
);

const MfaFields: React.FC<{
  form: SlotFormState;
  update: (key: keyof SlotFormState, value: string) => void;
  enabled: Record<string, boolean>;
  setEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}> = ({ form, update, enabled, setEnabled }) => (
  <>
    <div className="slot-editor-section">Two-factor authentication</div>
    <RadioRow
      id="nextKey2"
      label="Tab after Password"
      field="nextKey2"
      form={form}
      update={update}
      enabled={enabled}
      setEnabled={setEnabled}
      options={[
        { value: '1', label: 'Tab' },
        { value: '0', label: 'None' },
      ]}
    />
    <DelayRow id="delay3" context="before MFA" form={form} update={update} enabled={enabled} setEnabled={setEnabled} />
    <RadioRow
      id="nextKey5"
      label="Tab before OTP"
      field="nextKey5"
      form={form}
      update={update}
      enabled={enabled}
      setEnabled={setEnabled}
      options={NEXTKEY_BEFORE_FIELD_OPTIONS}
    />
    <SlotRow id="totp" label="OATH-TOTP (Google Authenticator)" enabled={enabled} setEnabled={setEnabled}>
      <input
        value={form.totpSecret}
        onChange={(e) => {
          update('totpSecret', e.target.value);
          if (e.target.value) update('mfaMode', 'googleAuthOtp');
        }}
        className={`${TEXT} font-mono`}
        placeholder="TOTP Secret"
      />
    </SlotRow>
    <RadioRow
      id="nextKey3"
      label="Return after OTP"
      field="nextKey3"
      form={form}
      update={update}
      enabled={enabled}
      setEnabled={setEnabled}
      options={NEXTKEY_AFTER_OTP_OPTIONS}
    />
    <SlotRow id="mfa" label="Yubikey OTP" enabled={enabled} setEnabled={setEnabled}>
      <div className="slot-yubi-inputs">
        <input
          value={form.yubiPublicId}
          onChange={(e) => {
            update('yubiPublicId', e.target.value);
            if (e.target.value) update('mfaMode', 'YubikeyOtp');
          }}
          className={`${INPUT} font-mono`}
          placeholder="Public Identity"
        />
        <input
          value={form.yubiPrivateId}
          onChange={(e) => {
            update('yubiPrivateId', e.target.value);
            if (e.target.value) update('mfaMode', 'YubikeyOtp');
          }}
          className={`${INPUT} font-mono`}
          placeholder="Private Identity"
        />
        <input
          value={form.yubiSecretKey}
          onChange={(e) => {
            update('yubiSecretKey', e.target.value);
            if (e.target.value) update('mfaMode', 'YubikeyOtp');
          }}
          className={`${INPUT} font-mono`}
          placeholder="Secret Key"
        />
      </div>
    </SlotRow>
  </>
);

const RadioRow: React.FC<{
  id: string;
  label: string;
  field: keyof SlotFormState;
  form: SlotFormState;
  update: (key: keyof SlotFormState, value: string) => void;
  enabled: Record<string, boolean>;
  setEnabled: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  options: readonly { value: string; label: string }[];
}> = ({ id, label, field, form, update, enabled, setEnabled, options }) => (
  <SlotRow id={id} label={label} enabled={enabled} setEnabled={setEnabled}>
    <div className="slot-editor-radios">
      {options.map((opt) => (
        <label key={opt.value} className="slot-editor-radio">
          <input
            type="radio"
            name={field}
            checked={form[field] === opt.value}
            onChange={() => update(field, opt.value)}
            className="ok-control"
          />
          {opt.label}
        </label>
      ))}
    </div>
  </SlotRow>
);

export default SlotEditor;