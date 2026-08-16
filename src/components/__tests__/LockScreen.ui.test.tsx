import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LockScreen from '../LockScreen';
import { DeviceType } from '../../api/device/types';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';

describe('LockScreen', () => {
  it('is hidden when disconnected', () => {
    renderWithProviders(<LockScreen />);
    expect(screen.queryByTestId('lock-screen')).not.toBeInTheDocument();
  });

  it('is hidden on Tools tab even when locked', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      isConfigMode: false,
      deviceType: DeviceType.CLASSIC,
      device: createMockDeviceClient(),
      activeTab: 'tools',
    });
    renderWithProviders(<LockScreen />);
    expect(screen.queryByTestId('lock-screen')).not.toBeInTheDocument();
  });

  it('shows classic keypad instructions', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      isConfigMode: false,
      deviceType: DeviceType.CLASSIC,
      device: createMockDeviceClient(),
      activeTab: 'setup',
    });
    renderWithProviders(<LockScreen />);
    expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
    expect(screen.getByText(/six-button keypad/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /unlock device/i })).not.toBeInTheDocument();
  });

  it('shows DUO PIN form and submits', async () => {
    const user = userEvent.setup();
    const setPin = vi.fn().mockResolvedValue(undefined);
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      isConfigMode: false,
      deviceType: DeviceType.DUO,
      device: createMockDeviceClient({ setPin }),
      activeTab: 'setup',
    });
    renderWithProviders(<LockScreen />);

    expect(screen.getByRole('heading', { name: /onlykey duo locked/i })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/enter pin/i), '123456');
    await user.click(screen.getByRole('button', { name: /unlock device/i }));

    expect(setPin).toHaveBeenCalledWith('123456');
  });

  it('is hidden for an uninitialized wiped device', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isConfigMode: false,
      deviceType: DeviceType.UNINITIALIZED,
      device: createMockDeviceClient(),
      activeTab: 'setup',
    });
    renderWithProviders(<LockScreen />);
    expect(screen.queryByTestId('lock-screen')).not.toBeInTheDocument();
  });

  it('does not duplicate the sidebar logo', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      deviceType: DeviceType.CLASSIC,
      device: createMockDeviceClient(),
    });
    renderWithProviders(<LockScreen />);
    expect(screen.queryByAltText('OnlyKey')).not.toBeInTheDocument();
  });
});