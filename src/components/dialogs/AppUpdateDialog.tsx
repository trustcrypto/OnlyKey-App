import React from 'react';
import {
  applyUpdate,
  confirmDownload,
  dismissUpdatePrompt,
  showDownloadedUpdate,
  useAppUpdateStore,
} from '../../store/useAppUpdateStore';

interface AppUpdateDialogProps {
  open: boolean;
}

const AppUpdateDialog: React.FC<AppUpdateDialogProps> = ({ open }) => {
  const phase = useAppUpdateStore((s) => s.phase);
  const currentVersion = useAppUpdateStore((s) => s.currentVersion);
  const latestVersion = useAppUpdateStore((s) => s.latestVersion);
  const error = useAppUpdateStore((s) => s.error);
  const downloadReceived = useAppUpdateStore((s) => s.downloadReceived);
  const downloadTotal = useAppUpdateStore((s) => s.downloadTotal);

  if (!open) return null;

  const percent =
    downloadTotal && downloadTotal > 0
      ? Math.min(100, Math.floor((downloadReceived / downloadTotal) * 100))
      : null;

  let title = 'App update';
  let message = '';
  let confirmLabel: string | null = null;
  let cancelLabel: string | null = 'OK';
  let onConfirm: (() => void) | null = null;
  let onCancel = () => dismissUpdatePrompt();
  let confirmDisabled = false;

  if (phase === 'available') {
    title = 'App update available';
    message = `Version ${latestVersion} is available. You have ${currentVersion}. Download the update?`;
    confirmLabel = 'Download';
    cancelLabel = 'Later';
    onConfirm = () => {
      void confirmDownload();
    };
  } else if (phase === 'downloading') {
    title = 'Downloading update';
    message =
      percent != null
        ? `Downloading ${latestVersion}… ${percent}%`
        : `Downloading ${latestVersion}…`;
    confirmLabel = null;
    cancelLabel = 'Later';
    confirmDisabled = true;
    onCancel = () => {
      /* no cancel while bytes are in flight */
    };
  } else if (phase === 'ready') {
    title = 'Update downloaded';
    message = `Version ${latestVersion} was downloaded and verified (SHA-256).`;
    confirmLabel = 'Install now';
    cancelLabel = 'Later';
    onConfirm = () => {
      void applyUpdate();
    };
    onCancel = () => {
      showDownloadedUpdate();
      dismissUpdatePrompt();
    };
  } else if (phase === 'applying') {
    title = 'Starting installer';
    message = 'OnlyKey App will quit.';
    confirmLabel = null;
    cancelLabel = null;
  } else if (phase === 'up-to-date') {
    title = 'App update';
    message = `OnlyKey App ${currentVersion} is up to date.`;
    confirmLabel = null;
    cancelLabel = 'OK';
  } else if (phase === 'error') {
    title = 'App update';
    message = error || 'App update failed.';
    confirmLabel = null;
    cancelLabel = 'OK';
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      data-testid="app-update-dialog"
      role="dialog"
      aria-labelledby="app-update-dialog-title"
      aria-modal="true"
    >
      <div className="bg-ok-gray w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6 space-y-4">
        <h3 id="app-update-dialog-title" className="text-xl font-bold">
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

export default AppUpdateDialog;
