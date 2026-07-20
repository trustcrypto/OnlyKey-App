import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { renderWithProviders } from './test/render';
import { seedConnectedClassicLocked, stubDeviceInitialize } from './test/store';

describe('App theme and status contrast', () => {
  it('applies light-mode connected status class when theme is toggled', async () => {
    stubDeviceInitialize();
    seedConnectedClassicLocked();
    const user = userEvent.setup();
    renderWithProviders(<App />);

    const status = screen.getByTestId('sidebar-status');
    const connection = within(status).getByText('Connected');
    expect(connection).toHaveClass('sidebar-status-connection--on');

    await user.click(screen.getByTestId('theme-toggle'));
    expect(document.documentElement).toHaveClass('light');
    expect(connection).toHaveClass('sidebar-status-connection--on');
  });

  it('allows theme toggle while disconnected', async () => {
    stubDeviceInitialize();
    const user = userEvent.setup();
    renderWithProviders(<App />);

    await user.click(screen.getByTestId('theme-toggle'));
    expect(document.documentElement).toHaveClass('light');
    expect(screen.getByTestId('disconnected-overlay')).toBeInTheDocument();
  });

  it('allows theme toggle while locked on non-Tools tabs', async () => {
    stubDeviceInitialize();
    seedConnectedClassicLocked();
    const user = userEvent.setup();
    renderWithProviders(<App />);

    expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
    await user.click(screen.getByTestId('theme-toggle'));
    expect(document.documentElement).toHaveClass('light');
  });
});