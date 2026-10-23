import React from 'react';
import {
  applyFirmware,
  confirmDownload,
  dismiss,
  openFirmwareTab,
  useFirmwareUpdateStore,
} from '../../store/useFirmwareUpdateStore';
import { useDeviceStore } from '../../store/useDeviceStore';

interface FirmwareUpdateDialogProps {
  open: boolean;
}

const FirmwareUpdateDialog: React.FC<FirmwareUpdateDialogProps> = ({ open }) => {
  const phase = useFirmwareUpdateStore((s) => s.phase);
  const currentVersion = useFirmwareUpdateStore((s) => s.currentVersion);
  const latestVersion = useFirmwareUpdateStore((s) => s.latestVersion);
  const error = useFirmwareUpdateStore((s) => s.error);
  const downloadReceived = useFirmwareUpdateStore((s) => s.downloadReceived);
  const downloadTotal = useFirmwareUpdateStore((s) => s.downloadTotal);
  const isBootloader = useDeviceStore((s) => s.isBootloader);
  const isInitialized = useDeviceStore((s) => s.isInitialized);
  const isConfigMode = useDeviceStore((s) => s.isConfigMode);
  const canLoadNow = isBootloader || !isInitialized || isConfigMode;

  if (!open) return null;

  const percent =
    downloadTotal && downloadTotal > 0
      ? Math.min(100, Math.floor((downloadReceived / downloadTotal) * 100))
      : null;

  let title = 'Firmware update';
  let message = '';
  let confirmLabel: string | null = null;
  let cancelLabel: string | null = 'OK';
  let onConfirm: (() => void) | null = null;
  let onCancel = () => dismiss();
  let confirmDisabled = false;

  if (phase === 'available') {
    title = 'Firmware update available';
    message = `Firmware ${latestVersion} is available. Your version is ${currentVersion}. Download the update?`;
    confirmLabel = 'Download';
    cancelLabel = 'Later';
    onConfirm = () => {
      void confirmDownload();
    };
  } else if (phase === 'downloading') {
    title = 'Downloading firmware';
    message =
      percent != null
        ? `Downloading firmware ${latestVersion}… ${percent}%`
        : `Downloading firmware ${latestVersion}…`;
    confirmLabel = null;
    cancelLabel = 'Later';
    confirmDisabled = true;
    onCancel = () => {
      /* no cancel while bytes are in flight */
    };
  } else if (phase === 'ready') {
    title = 'Firmware downloaded';
    if (canLoadNow) {
      message = `Firmware ${latestVersion} was downloaded and verified (SHA-256). Load onto OnlyKey? The key will restart. Do not remove OnlyKey.`;
      confirmLabel = 'Load firmware';
      cancelLabel = 'Later';
      onConfirm = () => {
        void applyFirmware();
      };
    } else {
      message = `Firmware ${latestVersion} was downloaded and verified (SHA-256). To load it, put OnlyKey in config mode. For OnlyKey hold down button #6 for 5+ seconds and release. For OnlyKey DUO hold down button #1 for 10+ seconds and release. The light will turn off; if a PIN was set, re-enter it. OnlyKey flashes red in config mode.`;
      confirmLabel = 'Open Firmware tab';
      cancelLabel = 'Later';
      onConfirm = () => {
        openFirmwareTab();
      };
    }
  } else if (phase === 'applying') {
    title = 'Loading firmware';
    message = 'Do not remove OnlyKey.';
    confirmLabel = null;
    cancelLabel = null;
  } else if (phase === 'up-to-date') {
    title = 'Firmware update';
    message = `Firmware ${currentVersion} is up to date.`;
    confirmLabel = null;
    cancelLabel = 'OK';
  } else if (phase === 'error') {
    title = 'Firmware update';
    message = error || 'Firmware update failed.';
    confirmLabel = null;
    cancelLabel = 'OK';
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      data-testid="firmware-update-dialog"
      role="dialog"
      aria-labelledby="firmware-update-dialog-title"
      aria-modal="true"
    >
      <div className="bg-ok-gray w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6 space-y-4">
        <h3 id="firmware-update-dialog-title" className="text-xl font-bold">
          {title}
        </h3>
        <p className="text-gray-400 text-sm leading-relaxed">{message}</p>
        {phase === 'downloading' && percent != null && (
          <div
            className="h-2 rounded-full bg-white/10 overflow-hidden"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full bg-ok-blue" style={{ width: `${percent}%` }} />
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          {cancelLabel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={phase === 'downloading'}
              className="px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl font-semibold disabled:opacity-40"
            >
              {cancelLabel}
            </button>
          )}
          {confirmLabel && (
            <button
              type="button"
              onClick={() => onConfirm?.()}
              disabled={confirmDisabled}
              className="px-5 py-2.5 bg-ok-blue hover:bg-blue-600 rounded-xl font-bold text-on-blue disabled:opacity-40"
            >
              {confirmLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FirmwareUpdateDialog;
