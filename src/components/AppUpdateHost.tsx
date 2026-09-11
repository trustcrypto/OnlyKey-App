import React, { useEffect } from 'react';
import {
  abortAppUpdateFetches,
  bindAutoUpdatePrefListeners,
  startAutoCheck,
  useAppUpdateStore,
  type AppUpdatePhase,
} from '../store/useAppUpdateStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { forceShowMainWindow } from '../desktop/windowVisibility';
import { userPreferences } from '../desktop/userPreferences';
import AppUpdateDialog from './dialogs/AppUpdateDialog';

function shouldPresent(phase: AppUpdatePhase): boolean {
  return (
    phase === 'available' ||
    phase === 'downloading' ||
    phase === 'ready' ||
    phase === 'error' ||
    phase === 'up-to-date'
  );
}

const AppUpdateHost: React.FC = () => {
  const phase = useAppUpdateStore((s) => s.phase);
  const promptVisible = useAppUpdateStore((s) => s.promptVisible);
  const isWorking = useDeviceStore((s) => s.isWorking);
  const isLocked = useDeviceStore((s) => s.isLocked);
  const isConnected = useDeviceStore((s) => s.isConnected);

  const deferred = isWorking || (isConnected && isLocked);
  const open = promptVisible && !deferred && shouldPresent(phase);

  useEffect(() => {
    const unbind = bindAutoUpdatePrefListeners();
    // After paint so React StrictMode does not start-then-cancel the first
    // check, and so --devtools is more likely to record the GET.
    const id = window.setTimeout(() => {
      void startAutoCheck();
    }, 0);
    return () => {
      window.clearTimeout(id);
      unbind();
    };
  }, []);

  useEffect(() => {
    if (typeof nw === 'undefined') return;
    const win = nw.Window.get();
    const onClose = () => {
      // Hide-to-tray also fires `close`. Keep the startup GET running.
      if (userPreferences.closeToTray) return;
      abortAppUpdateFetches();
    };
    win.on('close', onClose);
  }, []);

  useEffect(() => {
    if (!open || typeof nw === 'undefined') return;
    try {
      forceShowMainWindow(nw.Window.get());
    } catch {
      /* ignore */
    }
  }, [open]);

  return <AppUpdateDialog open={open} />;
};

export default AppUpdateHost;
