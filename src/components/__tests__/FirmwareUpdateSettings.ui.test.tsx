import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FirmwareUpdateSettings from '../FirmwareUpdateSettings';
import { renderWithProviders } from '../../test/render';
import {
  resetFirmwareUpdateStoreForTests,
  useFirmwareUpdateStore,
} from '../../store/useFirmwareUpdateStore';
import { AUTO_UPDATE_FW_PREF_EVENT } from '../../desktop/userPreferences';
import * as appRoot from '../../desktop/appRoot';

describe('FirmwareUpdateSettings', () => {
  const refreshTrayMenu = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    refreshTrayMenu.mockReset();
    vi.spyOn(appRoot, 'loadDesktopShell').mockReturnValue({ refreshTrayMenu });
    resetFirmwareUpdateStoreForTests();
  });

  afterEach(() => {
    resetFirmwareUpdateStoreForTests();
    vi.restoreAllMocks();
  });

  it('renders only the auto-check checkbox, default on, with no Check now', () => {
    renderWithProviders(<FirmwareUpdateSettings />);
    expect(screen.getByTestId('auto-update-fw-checkbox')).toBeChecked();
    expect(screen.getByLabelText(/automatically check for firmware updates/i)).toBeInTheDocument();
    expect(screen.queryByTestId('firmware-check-now')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /check now/i })).not.toBeInTheDocument();
  });

  it('toggles the preference, persists it, and rebuilds the tray menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirmwareUpdateSettings />);
    await user.click(screen.getByTestId('auto-update-fw-checkbox'));
    expect(useFirmwareUpdateStore.getState().autoCheckFW).toBe(false);
    expect(localStorage.getItem('autoUpdateFW')).toBe('false');
    expect(refreshTrayMenu).toHaveBeenCalled();
  });

  it('mirrors a tray (or CJS) pref change via onlykey-autoUpdateFW-changed', async () => {
    renderWithProviders(<FirmwareUpdateSettings />);
    expect(screen.getByTestId('auto-update-fw-checkbox')).toBeChecked();

    localStorage.setItem('autoUpdateFW', 'false');
    window.dispatchEvent(new Event(AUTO_UPDATE_FW_PREF_EVENT));

    await waitFor(() => {
      expect(useFirmwareUpdateStore.getState().autoCheckFW).toBe(false);
      expect(screen.getByTestId('auto-update-fw-checkbox')).not.toBeChecked();
    });
  });
});
