import React, { useState, useRef } from 'react';
import { useDeviceStore } from '../store/useDeviceStore';
import { parseFirmwareData } from '../api/device/utils';
import { clearPendingFirmware, storePendingFirmware } from '../desktop/firmwareCheck';
import { fetchLatestFirmwareRelease } from '../desktop/firmwareDownload';
import { DeviceType } from '../api/device/types';
import { TOOLTIPS } from '../data/tooltips';
import ConfigModeInstructions from './ConfigModeInstructions';
import { SetButton, StepFieldset } from './ui/forms';
import { HelpTip } from './ui/HelpTip';

const Firmware: React.FC = () => {
  const { device, version, isBootloader, fwUpdateSupport, deviceType } = useDeviceStore();
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isUninitialized = deviceType === DeviceType.UNINITIALIZED;

  const applyFirmwareBlocks = async (blocks: string[]) => {
    if (!device) return;

    if (isBootloader) {
      // Already in bootloader: load now. Do not persist pending — that is only
      // for the kick → reconnect gap. Leftover pending would reflash on the next
      // bootloader PID.
      clearPendingFirmware();
      setStatus('Sending firmware blocks...');
      await device.loadFirmwareBlocks(blocks, setProgress);
      setStatus('Firmware load complete!');
      return;
    }

    setStatus('Triggering reboot to bootloader — do not remove OnlyKey...');
    try {
      await device.triggerBootloader();
    } catch (err) {
      clearPendingFirmware();
      setStatus(null);
      throw err;
    }
    storePendingFirmware(blocks);
    setStatus('Device rebooting to bootloader. Reconnect and the update will resume automatically.');
  };

  const handleDownloadLatest = async () => {
    if (!device) return;
    setIsLoading(true);
    setError(null);
    setStatus(null);
    setProgress(0);
    try {
      const { version: latestVersion, blocks } = await fetchLatestFirmwareRelease();
      setStatus(`Downloaded firmware ${latestVersion}. Starting update...`);
      await applyFirmwareBlocks(blocks);
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
      await applyFirmwareBlocks(blocks);
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

      <StepFieldset>{firmwareInstructions()}</StepFieldset>

      <input
        ref={fileInputRef}
        type="file"
        accept=".okfw,.txt,.hex"
        disabled={isLoading || (!fwUpdateSupport && !isUninitialized)}
        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
        className="ok-file-input"
      />

      <div className="flex flex-wrap gap-2">
        <SetButton
          onClick={handleLoadFirmware}
          disabled={isLoading || !selectedFile || (!fwUpdateSupport && !isUninitialized)}
        >
          Load Firmware to OnlyKey
        </SetButton>
        {(isUninitialized || fwUpdateSupport) && (
          <SetButton onClick={handleDownloadLatest} disabled={isLoading}>
            Download Latest Firmware
          </SetButton>
        )}
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
      {error && <p className="critical-text">{error}</p>}
      {!isLoading && status && <p className="status-success text-sm">{status}</p>}
    </div>
  );
};

export default Firmware;