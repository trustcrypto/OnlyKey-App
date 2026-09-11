import React, { useEffect } from 'react';
import {
  bindAutoUpdatePrefListeners,
  checkNow,
  hydrateAutoUpdate,
  setAutoCheck,
  useAppUpdateStore,
} from '../store/useAppUpdateStore';
import { readLocalAppPackage } from '../desktop/updater';
import { PrefRow } from './ui/PrefRow';

function appVersion(): string {
  try {
    return readLocalAppPackage().version || '5.7.0';
  } catch {
    return '5.7.0';
  }
}

const AppUpdateSettings: React.FC = () => {
  const autoCheck = useAppUpdateStore((s) => s.autoCheck);
  const phase = useAppUpdateStore((s) => s.phase);
  const error = useAppUpdateStore((s) => s.error);
  const latestVersion = useAppUpdateStore((s) => s.latestVersion);
  const currentVersion = useAppUpdateStore((s) => s.currentVersion) || appVersion();

  useEffect(() => bindAutoUpdatePrefListeners(), []);

  const busy = phase === 'checking' || phase === 'downloading' || phase === 'applying';

  let status: string | null = null;
  if (phase === 'checking') status = 'Checking for updates…';
  else if (phase === 'downloading') status = `Downloading ${latestVersion ?? 'update'}…`;
  else if (phase === 'available') status = `Version ${latestVersion} is available.`;
  else if (phase === 'ready') status = `Version ${latestVersion} is downloaded and verified.`;
  else if (phase === 'up-to-date') status = `OnlyKey App ${currentVersion} is up to date.`;
  else if (error) status = error;

  return (
    <section className="tools-section" data-testid="app-update-settings">
      <PrefRow
        title="App updates"
        description={`This computer is running OnlyKey App ${currentVersion}.`}
        hint={status}
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoCheck}
            onChange={(e) => {
              setAutoCheck(e.target.checked);
              hydrateAutoUpdate();
            }}
            data-testid="auto-update-checkbox"
          />
          Automatically check for app updates
        </label>
        <button
          type="button"
          className="px-5 py-2.5 bg-ok-blue hover:bg-blue-600 rounded-xl font-bold text-on-blue disabled:opacity-40"
          disabled={busy}
          onClick={() => {
            void checkNow();
          }}
          data-testid="check-now"
        >
          Check now
        </button>
      </PrefRow>
    </section>
  );
};

export default AppUpdateSettings;
