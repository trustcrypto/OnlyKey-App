import React, { useState, useRef } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { DeviceType } from '../api/device/types';
import { verifyBackupData } from '../utils/backupVerify';
import { restoreBackupFromFile } from '../services/backup/backupService';
import { TOOLTIPS } from '../data/tooltips';
import { SetButton, StepFieldset } from './ui/forms';
import { HelpTip } from './ui/HelpTip';
import { PseudoTabBar, PseudoTabPanel } from './ui/PseudoTabs';

type BackupTab = 'backup' | 'restore';

const Backup: React.FC = () => {
  const { device, deviceType } = useDeviceStore();
  const isDuo = deviceType === DeviceType.DUO;
  const [activeTab, setActiveTab] = useState<BackupTab>('backup');
  const [backupData, setBackupData] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const trimmed = backupData.trim();
    if (!trimmed) {
      setBackupError('Backup data cannot be empty.');
      return;
    }
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `onlykey-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}-${pad(now.getMinutes())}.txt`;
    const blob = new Blob([trimmed], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setBackupError(null);
  };

  const handleRestore = async () => {
    const file = restoreFile ?? fileInputRef.current?.files?.[0];
    if (!file || !device) return;
    setIsRestoring(true);
    setRestoreError(null);
    try {
      await restoreBackupFromFile(device, file);
    } catch (err: unknown) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setRestoreFile(null);
    }
  };

  if (!device) return null;

  const hasBackupData = backupData.trim().length > 0;

  return (
    <div className="page-shell">
      <header className="page-header">
        <h2>Backup / Restore</h2>
      </header>
      <div className="page-body page-body--scroll content-panel">
        <PseudoTabBar
          tabs={[
            { id: 'backup', label: 'Backup' },
            { id: 'restore', label: 'Restore' },
          ]}
          active={activeTab}
          onChange={(id) => setActiveTab(id as BackupTab)}
        />

        <PseudoTabPanel id="backup" active={activeTab}>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <h3>
              Backup
              <HelpTip href={TOOLTIPS.backup.href} tooltip={TOOLTIPS.backup.text} />
            </h3>
            <StepFieldset>
              <p>
                <u>Step 1</u>. To begin backup, ensure that you have a backup passphrase set and have an offline copy of
                this backup passphrase. The same passphrase will be required to restore your OnlyKey.
              </p>
              <p>
                <u>Step 2</u>. Click inside the text area below. Hold the #1 button down on your OnlyKey for 5+ seconds and release. This
                will TYPE out an encrypted backup of your OnlyKey into the text area.
              </p>
              <p>
                <u>Step 3</u>. Once you see &quot;-----END ONLYKEY BACKUP-----&quot;,
                the backup process is complete. Click [Verify Backup] to verify the backup integrity, or
                [Save File] to save your encrypted backup.
              </p>
            </StepFieldset>
            <label className="block">
              <span className="font-semibold">Backup data</span>
              <textarea
                rows={4}
                value={backupData}
                onChange={(e) => setBackupData(e.target.value)}
                placeholder="DO NOT type in this field. Click inside here, then hold your OnlyKey button #1 for 5+ seconds."
                className="field-input mt-1 font-mono text-sm w-full"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <SetButton
                disabled={!hasBackupData}
                onClick={() => {
                  const result = verifyBackupData(backupData);
                  if (result.valid) {
                    setVerifyMessage(result.message || 'Backup verified.');
                    setBackupError(null);
                  } else {
                    setVerifyMessage(null);
                    setBackupError(result.error || 'Verification failed.');
                  }
                }}
              >
                Verify Backup
              </SetButton>
              <SetButton disabled={!hasBackupData} onClick={handleSave}>
                Save File
              </SetButton>
              {verifyMessage && <span className="status-success text-sm">{verifyMessage}</span>}
            </div>
            {backupError && <p className="critical-text">{backupError}</p>}
          </form>
        </PseudoTabPanel>

        <PseudoTabPanel id="restore" active={activeTab}>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            <h3>
              Restore
              <HelpTip href={TOOLTIPS.restore.href} tooltip={TOOLTIPS.restore.text} />
            </h3>
            <StepFieldset>
              <p>
                <u>Step 1</u>. To restore a backup file to your OnlyKey, ensure you have loaded the same backup passphrase or backup key you used to create the backup.
              </p>
              <p>
                <u>Step 2</u>.{' '}
                {isDuo ? (
                  <>Hold down button #1 on your OnlyKey DUO for 10+ seconds and release. The light will turn off. If a PIN was previously set, re-enter the PIN to enter config mode. You will notice the OnlyKey flashes red in config mode.</>
                ) : (
                  <>Hold down button #6 on your OnlyKey for 5+ seconds and release. The light will turn off. You will notice the OnlyKey flashes red in config mode.</>
                )}
              </p>
              <p>
                <u>Step 3</u>. Click [Choose File], select your backup file, then click [Restore to OnlyKey].
              </p>
              <p>
                <u>Step 4</u>. Restore can take up to 1 minute to complete, the OnlyKey will automatically reboot when restoring is complete.
              </p>
            </StepFieldset>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.okb"
              className="ok-file-input"
              onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
            />
            <SetButton disabled={isRestoring || !restoreFile} onClick={handleRestore}>
              {isRestoring ? 'Restoring...' : 'Restore to OnlyKey'}
            </SetButton>
            {restoreError && <p className="critical-text">{restoreError}</p>}
          </form>
        </PseudoTabPanel>
      </div>
    </div>
  );
};

export default Backup;