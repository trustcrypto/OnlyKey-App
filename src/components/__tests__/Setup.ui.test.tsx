import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Setup from '../Setup';
import { DeviceType } from '../../api/device/types';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';

describe('Setup page', () => {
  it('shows firmware and guided-setup actions for an uninitialized device', () => {
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
    });
    renderWithProviders(<Setup />);

    expect(screen.getByRole('button', { name: /load firmware/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeInTheDocument();
    expect(screen.getByText(/begin the guided setup wizard/i)).toBeInTheDocument();
  });

  it('shows Classic config-mode actions when initialized', () => {
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);

    expect(screen.getByText(/your onlykey is ready to use/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set backup passphrase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change primary pin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change self-destruct pin/i })).toBeInTheDocument();
  });

  it('opens the DUO PIN form from the initialized landing page', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.DUO,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);

    await user.click(screen.getByRole('button', { name: /set or change onlykey duo pins/i }));
    expect(screen.getByRole('heading', { name: /set or change pins/i })).toBeInTheDocument();
    expect(screen.getByText(/i understand and accept the above risk/i)).toBeInTheDocument();
  });
});
