import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { renderWithProviders } from './test/render';
import { DeviceType } from './api/device/types';
import { getStoreState, seedConnectedClassicLocked, seedDeviceStore, stubDeviceInitialize } from './test/store';

describe('App shell', () => {
  it('shows disconnected overlay on non-Tools tabs', () => {
    stubDeviceInitialize();
    renderWithProviders(<App />);
    expect(screen.getByTestId('disconnected-overlay')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /searching for onlykey/i })).toBeInTheDocument();
  });

  it('does not show a connecting hourglass on the Searching overlay', () => {
    stubDeviceInitialize();
    seedDeviceStore({ isConnecting: true });
    renderWithProviders(<App />);
    expect(screen.getByRole('heading', { name: /searching for onlykey/i })).toBeInTheDocument();
    expect(screen.queryByTestId('connecting-badge')).not.toBeInTheDocument();
    expect(screen.queryByText(/^connecting/i)).not.toBeInTheDocument();
  });

  it('allows Tools while disconnected', async () => {
    stubDeviceInitialize();
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(screen.getByTestId('nav-tools'));

    expect(screen.queryByTestId('disconnected-overlay')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^tools$/i })).toBeInTheDocument();
    expect(getStoreState().activeTab).toBe('tools');
  });

  it('navigates between sidebar tabs', async () => {
    stubDeviceInitialize();
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(screen.getByTestId('nav-slots'));
    expect(getStoreState().activeTab).toBe('slots');
    expect(screen.getByRole('heading', { name: /configure slots/i })).toBeInTheDocument();
  });

  it('shows connected status in sidebar when device is connected', () => {
    stubDeviceInitialize();
    seedConnectedClassicLocked();
    renderWithProviders(<App />);

    expect(within(screen.getByTestId('sidebar-status')).getByText('Connected')).toBeInTheDocument();
    expect(within(screen.getByTestId('sidebar-status')).getByText('OnlyKey v2.1.0-prod')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-status').textContent).not.toMatch(/\bclassic\b/i);
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.queryByTestId('disconnected-overlay')).not.toBeInTheDocument();
  });

  it('reports bootloader status instead of Unlocked after UNLOCKED BOOTLOADERv1', () => {
    stubDeviceInitialize();
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isConfigMode: false,
      isBootloader: true,
      deviceType: DeviceType.BOOTLOADER,
      version: 'v1',
      device: null,
    });
    renderWithProviders(<App />);

    expect(within(screen.getByTestId('sidebar-status')).getByText('Bootloader')).toBeInTheDocument();
    expect(within(screen.getByTestId('sidebar-status')).getByText('OnlyKey (bootloader v1)')).toBeInTheDocument();
    expect(screen.queryByText('Unlocked')).not.toBeInTheDocument();
    expect(screen.queryByText(/your onlykey is ready to use/i)).not.toBeInTheDocument();
  });

  it('reports a wiped device as Uninitialized, not Locked', () => {
    stubDeviceInitialize();
    seedDeviceStore({
      isConnected: true,
      isLocked: false,
      isConfigMode: false,
      deviceType: DeviceType.UNINITIALIZED,
      version: 'v2.1.0-prod',
      device: null,
    });
    renderWithProviders(<App />);

    expect(screen.getByText('Uninitialized')).toBeInTheDocument();
    expect(screen.queryByText('Locked')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lock-screen')).not.toBeInTheDocument();
  });

  it('toggles light/dark theme from sidebar', async () => {
    stubDeviceInitialize();
    const user = userEvent.setup();
    renderWithProviders(<App />);

    expect(document.documentElement.classList.contains('light')).toBe(false);

    await user.click(screen.getByTestId('theme-toggle'));
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('light');

    await user.click(screen.getByTestId('theme-toggle'));
    expect(document.documentElement.classList.contains('light')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('shows lock screen when connected and locked, except on Tools', async () => {
    stubDeviceInitialize();
    seedConnectedClassicLocked();
    const user = userEvent.setup();
    renderWithProviders(<App />);

    expect(screen.getByTestId('lock-screen')).toBeInTheDocument();

    await user.click(screen.getByTestId('nav-tools'));
    expect(screen.queryByTestId('lock-screen')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^tools$/i })).toBeInTheDocument();
  });
});