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
    void startAutoCheck();
    return bindAutoUpdatePrefListeners();
  }, []);

  useEffect(() => {
    if (typeof nw === 'undefined') return;
    const win = nw.Window.get();
    const onClose = () => abortAppUpdateFetches();
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
