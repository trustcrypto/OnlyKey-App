import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FirmwareUpdateSettings from '../FirmwareUpdateSettings';
import { renderWithProviders } from '../../test/render';
import {
  resetFirmwareUpdateStoreForTests,
  useFirmwareUpdateStore,
} from '../../store/useFirmwareUpdateStore';
import { seedDeviceStore } from '../../test/store';

describe('FirmwareUpdateSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetFirmwareUpdateStoreForTests();
    seedDeviceStore({
      isConnected: false,
      isLocked: true,
      isBootloader: false,
      isWorking: false,
      version: '',
    });
  });

  afterEach(() => {
    resetFirmwareUpdateStoreForTests();
  });

  it('renders the checkbox and disables Check now when disconnected', () => {
    renderWithProviders(<FirmwareUpdateSettings />);
    expect(screen.getByTestId('auto-update-fw-checkbox')).toBeChecked();
    expect(screen.getByTestId('firmware-check-now')).toBeDisabled();
  });

  it('enables Check now when a device is connected and unlocked', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isBootloader: false,
      isWorking: false,
      version: 'v2.1.2 STD',
    });
    renderWithProviders(<FirmwareUpdateSettings />);
    expect(screen.getByTestId('firmware-check-now')).toBeEnabled();
  });

  it('disables Check now while checking', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isBootloader: false,
      isWorking: false,
      version: 'v2.1.2 STD',
    });
    useFirmwareUpdateStore.setState({
      phase: 'checking',
      error: 'Could not reach the firmware server (HTTP 502).',
    });
    renderWithProviders(<FirmwareUpdateSettings />);
    expect(screen.getByTestId('firmware-check-now')).toBeDisabled();
  });

  it('toggles the auto-update firmware preference while disconnected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<FirmwareUpdateSettings />);
    await user.click(screen.getByTestId('auto-update-fw-checkbox'));
    expect(useFirmwareUpdateStore.getState().autoCheckFW).toBe(false);
    expect(localStorage.getItem('autoUpdateFW')).toBe('false');
  });
});
