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
    const sendPinDUO = vi.fn().mockResolvedValue(undefined);
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      isConfigMode: false,
      deviceType: DeviceType.DUO,
      device: createMockDeviceClient({ sendPinDUO }),
      activeTab: 'setup',
    });
    renderWithProviders(<LockScreen />);

    expect(screen.getByRole('heading', { name: /onlykey duo locked/i })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/enter pin/i), '123456');
    await user.click(screen.getByRole('button', { name: /unlock device/i }));

    expect(sendPinDUO).toHaveBeenCalledWith(['123456'], false);
  });

  it('keeps the DUO PIN field and shows Incorrect PIN after INITIALIZED-D', async () => {
    const user = userEvent.setup();
    const sendPinDUO = vi.fn().mockRejectedValue(new Error('Incorrect PIN'));
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      isConfigMode: false,
      deviceType: DeviceType.DUO,
      device: createMockDeviceClient({ sendPinDUO }),
      pinError: 'Incorrect PIN',
      activeTab: 'setup',
    });
    renderWithProviders(<LockScreen />);
    await user.type(screen.getByPlaceholderText(/enter pin/i), '1111111');
    await user.click(screen.getByRole('button', { name: /unlock device/i }));
    expect(sendPinDUO).toHaveBeenCalledWith(['1111111'], false);
    expect(screen.getByPlaceholderText(/enter pin/i)).toHaveValue('1111111');
    expect(screen.getByText(/incorrect pin/i)).toBeInTheDocument();
  });

  it('is hidden in bootloader so firmware load is not covered by the lock overlay', () => {
    seedDeviceStore({
      isConnected: true,
      isLocked: true,
      isConfigMode: false,
      isBootloader: true,
      deviceType: DeviceType.BOOTLOADER,
      device: createMockDeviceClient(),
      activeTab: 'firmware',
    });
    renderWithProviders(<LockScreen />);
    expect(screen.queryByTestId('lock-screen')).not.toBeInTheDocument();
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