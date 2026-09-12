import React, { useEffect, useRef } from 'react';
import {
  abortFirmwareUpdateFetches,
  bindAutoUpdateFWPrefListeners,
  isSafeFirmwareCheckMoment,
  resetOnDisconnect,
  startAutoCheck,
  useFirmwareUpdateStore,
  type FirmwareUpdatePhase,
} from '../store/useFirmwareUpdateStore';
import { useDeviceStore } from '../store/useDeviceStore';
import { forceShowMainWindow } from '../desktop/windowVisibility';
import { userPreferences } from '../desktop/userPreferences';
import FirmwareUpdateDialog from './dialogs/FirmwareUpdateDialog';

function shouldPresent(phase: FirmwareUpdatePhase): boolean {
  return (
    phase === 'available' ||
    phase === 'downloading' ||
    phase === 'ready' ||
    phase === 'applying' ||
    phase === 'error' ||
    phase === 'up-to-date'
  );
}

const FirmwareUpdateHost: React.FC = () => {
  const phase = useFirmwareUpdateStore((s) => s.phase);
  const promptVisible = useFirmwareUpdateStore((s) => s.promptVisible);
  const isWorking = useDeviceStore((s) => s.isWorking);
  const isLocked = useDeviceStore((s) => s.isLocked);
  const isConnected = useDeviceStore((s) => s.isConnected);
  const isBootloader = useDeviceStore((s) => s.isBootloader);
  const isInitialized = useDeviceStore((s) => s.isInitialized);
  const version = useDeviceStore((s) => s.version);
  const occupy = useDeviceStore((s) => s.setupOccupiesFirmwarePrompt);

  const deferred =
    isWorking || (isConnected && isLocked) || occupy || isBootloader;
  const open = promptVisible && !deferred && shouldPresent(phase);

  const wasConnectedRef = useRef(false);

  useEffect(() => {
    return bindAutoUpdateFWPrefListeners();
  }, []);

  useEffect(() => {
    if (!isSafeFirmwareCheckMoment()) return;
    void startAutoCheck();
  }, [
    isConnected,
    isLocked,
    isBootloader,
    isWorking,
    occupy,
    version,
    isInitialized,
  ]);

  useEffect(() => {
    if (isConnected) {
      wasConnectedRef.current = true;
      return;
    }
    if (!wasConnectedRef.current) return;
    wasConnectedRef.current = false;
    resetOnDisconnect();
  }, [isConnected]);

  useEffect(() => {
    if (typeof nw === 'undefined') return;
    const win = nw.Window.get();
    const onClose = () => {
      if (userPreferences.closeToTray) return;
      abortFirmwareUpdateFetches();
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

  return <FirmwareUpdateDialog open={open} />;
};

export default FirmwareUpdateHost;
