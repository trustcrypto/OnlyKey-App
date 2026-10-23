import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import Preferences from './components/Preferences';
import { renderWithProviders } from './test/render';
import {
  createMockDeviceClient,
  seedConnectedClassicLocked,
  seedDeviceStore,
  stubDeviceInitialize,
} from './test/store';
import './index.css';

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

  it('gives dark-mode select options a dark background and light text', () => {
    seedDeviceStore({ device: createMockDeviceClient() });
    renderWithProviders(<Preferences />);
    const option = screen.getByRole('option', { name: /us_english/i });
    const color = getComputedStyle(option).color.replace(/\s/g, '');
    const background = getComputedStyle(option).backgroundColor.replace(/\s/g, '');
    expect(color).toMatch(/^(#ffffff|rgb\(255,255,255\))$/i);
    expect(background).toMatch(/^(#2d2d2d|rgb\(45,45,45\))$/i);
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