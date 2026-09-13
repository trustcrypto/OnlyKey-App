import React, { useEffect } from 'react';
import {
  bindAutoUpdateFWPrefListeners,
  setAutoUpdateFW,
  useFirmwareUpdateStore,
} from '../store/useFirmwareUpdateStore';
import { PrefRow } from './ui/PrefRow';

const FirmwareUpdateSettings: React.FC = () => {
  const autoCheckFW = useFirmwareUpdateStore((s) => s.autoCheckFW);

  useEffect(() => bindAutoUpdateFWPrefListeners(), []);

  return (
    <section className="tools-section" data-testid="firmware-update-settings">
      <PrefRow title="Firmware">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoCheckFW}
            onChange={(e) => setAutoUpdateFW(e.target.checked)}
            data-testid="auto-update-fw-checkbox"
          />
          Automatically check for firmware updates
        </label>
      </PrefRow>
    </section>
  );
};

export default FirmwareUpdateSettings;
