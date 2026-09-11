import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppUpdateSettings from '../AppUpdateSettings';
import { renderWithProviders } from '../../test/render';
import { resetAppUpdateStoreForTests, useAppUpdateStore } from '../../store/useAppUpdateStore';

describe('AppUpdateSettings', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAppUpdateStoreForTests();
  });

  afterEach(() => {
    resetAppUpdateStoreForTests();
  });

  it('renders the checkbox and Check now', () => {
    renderWithProviders(<AppUpdateSettings />);
    expect(screen.getByTestId('auto-update-checkbox')).toBeChecked();
    expect(screen.getByTestId('check-now')).toBeEnabled();
  });

  it('disables Check now while checking and shows the last error', () => {
    useAppUpdateStore.setState({
      phase: 'checking',
      error: 'Could not reach the update server (HTTP 502).',
    });
    renderWithProviders(<AppUpdateSettings />);
    expect(screen.getByTestId('check-now')).toBeDisabled();
  });

  it('toggles the auto-update preference', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AppUpdateSettings />);
    await user.click(screen.getByTestId('auto-update-checkbox'));
    expect(useAppUpdateStore.getState().autoCheck).toBe(false);
  });
});
