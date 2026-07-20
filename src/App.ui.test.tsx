import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { renderWithProviders } from './test/render';
import { getStoreState, seedConnectedClassicLocked, stubDeviceInitialize } from './test/store';

describe('App shell', () => {
  it('shows disconnected overlay on non-Tools tabs', () => {
    stubDeviceInitialize();
    renderWithProviders(<App />);
    expect(screen.getByTestId('disconnected-overlay')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /searching for onlykey/i })).toBeInTheDocument();
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
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.queryByTestId('disconnected-overlay')).not.toBeInTheDocument();
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