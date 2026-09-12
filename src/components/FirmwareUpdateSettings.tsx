import React, { useEffect } from 'react';
import {
  bindAutoUpdateFWPrefListeners,
  checkNow,
  hydrateAutoUpdateFW,
  setAutoUpdateFW,
  useFirmwareUpdateStore,
} from '../store/useFirmwareUpdateStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { PrefRow } from './ui/PrefRow';

const FirmwareUpdateSettings: React.FC = () => {
  const autoCheckFW = useFirmwareUpdateStore((s) => s.autoCheckFW);
  const phase = useFirmwareUpdateStore((s) => s.phase);
  const error = useFirmwareUpdateStore((s) => s.error);
  const latestVersion = useFirmwareUpdateStore((s) => s.latestVersion);
  const storeCurrent = useFirmwareUpdateStore((s) => s.currentVersion);
  const isConnected = useDeviceStore((s) => s.isConnected);
  const isLocked = useDeviceStore((s) => s.isLocked);
  const isBootloader = useDeviceStore((s) => s.isBootloader);
  const isWorking = useDeviceStore((s) => s.isWorking);
  const version = useDeviceStore((s) => s.version);
  const currentVersion = storeCurrent || version;

  useEffect(() => bindAutoUpdateFWPrefListeners(), []);

  const busy = phase === 'checking' || phase === 'downloading' || phase === 'applying';
  const deviceBusy = !isConnected || isLocked || isBootloader || isWorking;
  const checkDisabled = busy || deviceBusy;

  let status: string | null = null;
  if (phase === 'checking') status = 'Checking for firmware updates…';
  else if (phase === 'downloading') status = `Downloading firmware ${latestVersion ?? ''}…`;
  else if (phase === 'available') status = `Firmware ${latestVersion} is available.`;
  else if (phase === 'ready') status = `Firmware ${latestVersion} is downloaded and verified.`;
  else if (phase === 'up-to-date') status = `Firmware ${currentVersion} is up to date.`;
  else if (error) status = error;
  else if (!isConnected) status = 'Connect OnlyKey to check for firmware updates.';
  else if (isLocked) status = 'Unlock OnlyKey to check for firmware updates.';
  else if (isBootloader || isWorking) status = 'Wait until OnlyKey is ready to check for firmware updates.';

  const description = isConnected && currentVersion
    ? `This OnlyKey is running firmware ${currentVersion}.`
    : 'Firmware updates are checked when OnlyKey is connected and unlocked.';

  return (
    <section className="tools-section" data-testid="firmware-update-settings">
      <PrefRow
        title="Firmware updates"
        description={description}
        hint={status}
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoCheckFW}
            onChange={(e) => {
              setAutoUpdateFW(e.target.checked);
              hydrateAutoUpdateFW();
            }}
            data-testid="auto-update-fw-checkbox"
          />
          Automatically check for firmware updates
        </label>
        <button
          type="button"
          className="px-5 py-2.5 bg-ok-blue hover:bg-blue-600 rounded-xl font-bold text-on-blue disabled:opacity-40"
          disabled={checkDisabled}
          onClick={() => {
            void checkNow();
          }}
          data-testid="firmware-check-now"
        >
          Check now
        </button>
      </PrefRow>
    </section>
  );
};

export default FirmwareUpdateSettings;
