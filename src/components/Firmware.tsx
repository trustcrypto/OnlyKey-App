import React, { useEffect, useState, useRef } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import {
  bindAutoUpdateFWPrefListeners,
  checkNow,
  setAutoUpdateFW,
  useFirmwareUpdateStore,
} from '../store/useFirmwareUpdateStore';
import { parseFirmwareData } from '../api/device/utils';
import { applyFirmwareBlocks } from '../desktop/firmwareApply';
import { downloadLatestFirmware } from '../desktop/firmwareDownload';
import { isUninitializedDevice } from '../api/device/deviceTypeFromStatus';
import { TOOLTIPS } from '../data/tooltips';
import ConfigModeInstructions from './ConfigModeInstructions';
import { SetButton, StepFieldset } from './ui/forms';
import { HelpTip } from './ui/HelpTip';

const Firmware: React.FC = () => {
  const {
    device,
    version,
    isBootloader,
    fwUpdateSupport,
    deviceType,
    isInitialized,
    isLocked,
    isWorking,
    setWorking,
  } = useDeviceStore();
  const storeError = useFirmwareUpdateStore((s) => s.error);
  const fwPhase = useFirmwareUpdateStore((s) => s.phase);
  const autoCheckFW = useFirmwareUpdateStore((s) => s.autoCheckFW);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isUninitialized = isUninitializedDevice({ isInitialized, deviceType });
  const canLoadFirmware = isBootloader || isUninitialized || fwUpdateSupport;
  const fwBusy = fwPhase === 'checking' || fwPhase === 'downloading' || fwPhase === 'applying';
  const checkDisabled = isLoading || fwBusy || isLocked || isBootloader || isWorking;
  const displayError = error || (status ? null : storeError);

  useEffect(() => bindAutoUpdateFWPrefListeners(), []);

  const runApply = async (blocks: string[]) => {
    if (!device) return;
    if (isBootloader) setStatus('Sending firmware blocks...');
    else setStatus('Triggering reboot to bootloader — do not remove OnlyKey...');
    const result = await applyFirmwareBlocks({
      device,
      blocks,
      isBootloader,
      setWorking: (active, message, progress) => {
        if (typeof progress === 'number') setProgress(progress);
        setWorking(active, message, progress);
      },
    });
    if (result === 'streamed') {
      setStatus('Firmware load complete!');
    } else {
      setStatus(
        'Device rebooting to bootloader. Reconnect and the update will resume automatically.',
      );
    }
  };

  const handleDownloadLatest = async () => {
    if (!device) return;
    setIsLoading(true);
    setError(null);
    setStatus(null);
    setProgress(0);
    try {
      const { version: latestVersion, blocks } = await downloadLatestFirmware();
      setStatus(`Downloaded firmware ${latestVersion}. Starting update...`);
      await runApply(blocks);
    } catch (err: unknown) {
      setStatus(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadFirmware = async () => {
    if (!selectedFile || !device) return;

    setIsLoading(true);
    setError(null);
    setStatus(null);
    setProgress(0);

    try {
      const blocks = parseFirmwareData(await selectedFile.text());
      if (!blocks.length) throw new Error('Could not parse firmware file.');
      await runApply(blocks);
    } catch (err: unknown) {
      setStatus(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const firmwareInstructions = () => {
    if (isBootloader || isUninitialized) {
      return (
        <p className="text-secondary">
          To load a new firmware file to your OnlyKey, click [Choose File], select your firmware file, then click [Load
          Firmware to OnlyKey].
        </p>
      );
    }
    if (fwUpdateSupport) {
      return (
        <div className="space-y-2 text-secondary">
          <p>
            <u>Step 1</u>. <ConfigModeInstructions inline />
          </p>
          <p>
            <u>Step 2</u>. Click [Choose File], select your firmware file, then click [Load Firmware to OnlyKey].
          </p>
          <p>
            <u>Step 3</u>. The OnlyKey will flash white while loading your firmware, then will restart automatically when
            firmware load is complete.
          </p>
        </div>
      );
    }
    return (
      <p className="text-secondary">
        This version of firmware is outdated and does not support this feature. To load latest firmware follow the
        loading instructions{' '}
        <a href="https://docs.crp.to/usersguide.html#loading-onlykey-firmware" target="_blank" rel="noreferrer">
          here
        </a>
      </p>
    );
  };

  if (!device) return null;

  return (
    <div className="page-shell space-y-4 max-w-2xl">
      <header className="page-header">
        <h2 className="text-xl font-bold">
          Load Firmware <HelpTip href={TOOLTIPS.firmware.href} tooltip={TOOLTIPS.firmware.text} />
        </h2>
      </header>

      <label className="flex items-center gap-2 text-sm text-secondary">
        <input
          type="checkbox"
          checked={autoCheckFW}
          onChange={(e) => setAutoUpdateFW(e.target.checked)}
          data-testid="auto-update-fw-checkbox"
        />
        Automatically check for firmware updates
      </label>

      <StepFieldset>{firmwareInstructions()}</StepFieldset>

      <input
        ref={fileInputRef}
        type="file"
        accept=".okfw,.txt,.hex"
        disabled={isLoading || !canLoadFirmware}
        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
        className="ok-file-input"
      />

      <div className="flex flex-wrap gap-2">
        <SetButton
          onClick={handleLoadFirmware}
          disabled={isLoading || !selectedFile || !canLoadFirmware}
          title={selectedFile ? undefined : 'Select a firmware file first'}
        >
          Load Firmware to OnlyKey
        </SetButton>
        {canLoadFirmware && (
          <SetButton onClick={handleDownloadLatest} disabled={isLoading}>
            Download Latest Firmware
          </SetButton>
        )}
        <SetButton
          onClick={() => {
            setError(null);
            setStatus(null);
            void checkNow();
          }}
          disabled={checkDisabled}
          data-testid="firmware-tab-check-now"
        >
          Check now
        </SetButton>
      </div>

      {version && (
        <p className="text-secondary text-sm">
          Current firmware: <strong className="firmware-version-value">{version}</strong>{' '}
          {isBootloader ? '(Bootloader Mode)' : ''}
        </p>
      )}

      {isLoading && (
        <p className="text-secondary text-sm">
          {status || 'Processing...'} {progress > 0 ? `(${progress}%)` : ''}
        </p>
      )}
      {displayError && <p className="critical-text">{displayError}</p>}
      {!isLoading && status && <p className="status-success text-sm">{status}</p>}
    </div>
  );
};

export default Firmware;