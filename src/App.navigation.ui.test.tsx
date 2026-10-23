import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { renderWithProviders } from './test/render';
import { getStoreState, seedConnectedClassicUnlocked, stubDeviceInitialize } from './test/store';

const NAV_CASES = [
  { testId: 'nav-setup', heading: /onlykey setup/i },
  { testId: 'nav-slots', heading: /configure slots/i },
  { testId: 'nav-keys', heading: /^keys$/i },
  { testId: 'nav-backup', heading: /backup \/ restore/i },
  { testId: 'nav-firmware', heading: /load firmware/i },
  { testId: 'nav-preferences', heading: /^preferences$/i },
  { testId: 'nav-advanced', heading: /^advanced$/i },
  { testId: 'nav-tools', heading: /^tools$/i },
] as const;

describe('App navigation (connected)', () => {
  it('renders every main tab when device is connected and unlocked', async () => {
    stubDeviceInitialize();
    seedConnectedClassicUnlocked();
    const user = userEvent.setup();
    renderWithProviders(<App />);

    for (const { testId, heading } of NAV_CASES) {
      await user.click(screen.getByTestId(testId));
      expect(getStoreState().activeTab).toBe(testId.replace('nav-', ''));
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  it('exposes accessible main navigation', () => {
    stubDeviceInitialize();
    renderWithProviders(<App />);
    expect(screen.getByRole('navigation', { name: /main navigation/i })).toBeInTheDocument();
  });
});