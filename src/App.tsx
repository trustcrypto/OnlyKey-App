import React, { useEffect } from 'react';
import { useDeviceStore } from './store/useDeviceStore';
import { getHidStatus } from './utils/hidStatus';
import LockScreen from './components/LockScreen';
import SlotGrid from './components/SlotGrid';
import SlotEditor from './components/SlotEditor';
import Preferences from './components/Preferences';
import Setup from './components/Setup';
import Keys from './components/Keys';
import Backup from './components/Backup';
import Firmware from './components/Firmware';
import Advanced from './components/Advanced';
import Tools from './components/Tools';
import DeviceDialogs from './components/DeviceDialogs';
import WorkingDialog from './components/dialogs/WorkingDialog';
import ThemeToggle from './components/ThemeToggle';
import DeviceMessages from './components/DeviceMessages';
import { HelpTip } from './components/ui/HelpTip';
import { TOOLTIPS } from './data/tooltips';
import { shouldUseMockDevice } from './utils/mockDevice';
import { DeviceType } from './api/device/types';

const App: React.FC = () => {
  const {
    initialize,
    isConnected,
    isLocked,
    isConfigMode,
    isConnecting,
    deviceType,
    version,
    error,
    activeTab,
    setActiveTab,
    sessionEpoch,
  } = useDeviceStore();
  const hidStatus = getHidStatus();

  useEffect(() => {
    initialize(shouldUseMockDevice());
  }, [initialize]);

  return (
    <div className="flex h-screen bg-ok-dark overflow-hidden select-none relative">
      <DeviceDialogs />
      {/* sessionEpoch forces remount — wipes WorkingDialog / SlotEditor local state */}
      <WorkingDialog key={`working-${sessionEpoch}`} />
      <SlotEditor key={`slot-editor-${sessionEpoch}`} />

      <div className="w-56 shrink-0 bg-ok-gray flex flex-col min-h-0 h-full border-r border-white/10">
        <div className="sidebar-brand shrink-0 p-3 flex items-center justify-between gap-2 min-w-0">
          <img
            src="./images/onlykey-logo_full.png"
            alt="OnlyKey"
            className="app-logo"
            draggable={false}
          />
          <ThemeToggle />
        </div>

        <nav className="flex-1 min-h-0 px-2.5 py-2 space-y-1 overflow-hidden" aria-label="Main navigation">
          <NavItem testId="nav-setup" label="Setup" icon="🚀" active={activeTab === 'setup'} onClick={() => setActiveTab('setup')} />
          <NavItem testId="nav-slots" label="Slots" icon="⚙️" active={activeTab === 'slots'} onClick={() => setActiveTab('slots')} />
          <NavItem testId="nav-keys" label="Keys" icon="🔑" active={activeTab === 'keys'} onClick={() => setActiveTab('keys')} />
          <NavItem testId="nav-backup" label="Backup" icon="💾" active={activeTab === 'backup'} onClick={() => setActiveTab('backup')} />
          <NavItem testId="nav-firmware" label="Firmware" icon="🆙" active={activeTab === 'firmware'} onClick={() => setActiveTab('firmware')} />
          <NavItem testId="nav-preferences" label="Preferences" icon="🔧" active={activeTab === 'preferences'} onClick={() => setActiveTab('preferences')} />
          <NavItem testId="nav-advanced" label="Advanced" icon="🛡️" active={activeTab === 'advanced'} onClick={() => setActiveTab('advanced')} />
          <NavItem testId="nav-tools" label="Tools" icon="🧰" active={activeTab === 'tools'} onClick={() => setActiveTab('tools')} />
        </nav>

        <div className="sidebar-status" data-testid="sidebar-status">
          <div className="sidebar-status-row">
            <span>Status</span>
            <span className={`sidebar-status-connection ${isConnected ? 'sidebar-status-connection--on' : 'sidebar-status-connection--off'}`}>
              <span className="sidebar-status-dot" />
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {isConnected && (
            <>
              <div className="sidebar-status-device">
                {deviceType} {version}
              </div>
              <div className="sidebar-status-mode">
                {isConfigMode
                  ? 'Config mode'
                  : deviceType === DeviceType.UNINITIALIZED
                    ? 'Uninitialized'
                    : isLocked
                      ? 'Locked'
                      : 'Unlocked'}
              </div>
              <DeviceMessages />
            </>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col relative overflow-hidden min-w-0">
        {/*
          CRITICAL security boundary: key={sessionEpoch} remounts LockScreen + every
          page when the device unplugs or locks, wiping React useState (backup
          ciphertext, setup PINs/passphrases, key material drafts, etc.).
        */}
        <div key={sessionEpoch} className="flex-1 flex flex-col relative overflow-hidden min-w-0" data-testid="session-root">
          <LockScreen />
          {!isConnected && activeTab !== 'tools' && (
            <div
              data-testid="disconnected-overlay"
              className="absolute inset-0 bg-ok-dark z-50 flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="relative">
                <div className="w-24 h-24 bg-ok-gray rounded-full flex items-center justify-center text-4xl mb-6 shadow-2xl border border-white/10 animate-pulse">
                  🔌
                </div>
                {isConnecting && (
                  <div
                    data-testid="connecting-badge"
                    className="absolute -bottom-2 -right-2 w-8 h-8 bg-ok-blue rounded-full border-4 border-ok-dark flex items-center justify-center animate-spin"
                  >
                    <span className="text-[10px] text-on-blue">⌛</span>
                  </div>
                )}
              </div>
              <h2 className="text-2xl font-bold mb-2">Searching for OnlyKey...</h2>
              <p className="text-secondary max-w-sm mb-4">
                Please insert your OnlyKey into a USB port. The app will automatically detect and connect to your device.
              </p>
              {isConnecting && (
                <p data-testid="connecting-label" className="text-muted text-sm">
                  Connecting...
                </p>
              )}
              {!hidStatus.available && (
                <p className="text-amber-300/90 text-sm bg-amber-500/10 px-3 py-2 rounded max-w-md mt-3">
                  {hidStatus.hint}
                </p>
              )}
              {error && (
                <p className="mt-4 text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded max-w-md">{error}</p>
              )}
            </div>
          )}

          <main id="app-main" className={`flex-1 min-h-0 overflow-hidden ${activeTab === 'slots' ? 'slots-page' : ''}`}>
            {activeTab === 'setup' && <Setup />}
            {activeTab === 'slots' && (
              <div className="page-shell slots-page h-full">
                <header className="page-header">
                  <h2 className="text-xl font-bold">
                    Configure Slots <HelpTip href={TOOLTIPS.slots.href} tooltip={TOOLTIPS.slots.text} />
                  </h2>
                </header>
                <div className="page-body">
                  <SlotGrid />
                </div>
              </div>
            )}
            {activeTab === 'keys' && <Keys />}
            {activeTab === 'backup' && <Backup />}
            {activeTab === 'firmware' && <Firmware />}
            {activeTab === 'preferences' && <Preferences />}
            {activeTab === 'advanced' && <Advanced />}
            {activeTab === 'tools' && <Tools />}
          </main>
        </div>
      </div>
    </div>
  );
};

interface NavItemProps {
  testId: string;
  label: string;
  icon: string;
  active?: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ testId, label, icon, active, onClick }) => (
  <button
    type="button"
    data-testid={testId}
    onClick={onClick}
    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 text-[0.9375rem] ${
      active ? 'bg-ok-blue text-on-blue shadow-lg shadow-ok-blue/20' : 'text-muted hover:bg-white/5 hover:text-secondary'
    }`}
  >
    <span className="text-lg">{icon}</span>
    <span className="font-medium">{label}</span>
  </button>
);

export default App;