import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Preferences from '../Preferences';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';

describe('Preferences page', () => {
  it('is hidden without a device', () => {
    seedDeviceStore({ device: null });
    const { container } = renderWithProviders(<Preferences />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders standard preference controls', () => {
    seedDeviceStore({ device: createMockDeviceClient() });
    renderWithProviders(<Preferences />);

    expect(screen.getByRole('heading', { name: 'Preferences', exact: true })).toBeInTheDocument();
    expect(screen.getByText('Keyboard Type Speed')).toBeInTheDocument();
    expect(screen.getByText('Keyboard Layout')).toBeInTheDocument();
    expect(screen.getByText('Indicator Light (LED) Brightness')).toBeInTheDocument();
    expect(screen.getByText('Inactivity Lockout Timer')).toBeInTheDocument();
    expect(screen.getByText('Lock Button')).toBeInTheDocument();
  });

  it('calls device.setTypeSpeed when Set Type Speed is clicked', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device });
    renderWithProviders(<Preferences />);

    const speedSection = screen.getByText('Keyboard Type Speed').closest('section')!;
    await user.type(within(speedSection).getByRole('spinbutton'), '7');
    await user.click(screen.getByRole('button', { name: /set type speed/i }));

    expect(device.setTypeSpeed).toHaveBeenCalledWith(7);
  });

  it('shows advanced tab with config-mode note', async () => {
    const user = userEvent.setup();
    seedDeviceStore({ device: createMockDeviceClient() });
    renderWithProviders(<Preferences />);

    await user.click(screen.getByRole('tab', { name: 'Advanced' }));
    expect(screen.getByText(/these settings require your onlykey to be in/i)).toBeInTheDocument();
    expect(screen.getAllByText('Sysadmin Mode').length).toBeGreaterThan(0);
    expect(screen.getByText('Full Wipe Mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set full wipe mode/i })).toBeInTheDocument();
  });

  it('notes that standard preferences do not need config mode', () => {
    seedDeviceStore({ device: createMockDeviceClient() });
    renderWithProviders(<Preferences />);
    expect(screen.getByTestId('pref-standard-note')).toHaveTextContent(/config mode is not required/i);
  });

  it('saves layout, lockout, and advanced sysadmin mode', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device });
    renderWithProviders(<Preferences />);

    await user.click(screen.getByRole('button', { name: /set layout/i }));
    expect(device.setKbdLayout).toHaveBeenCalledWith(0x01);

    const lockoutSection = screen.getByText('Inactivity Lockout Timer').closest('section')!;
    await user.type(within(lockoutSection).getByRole('spinbutton'), '15');
    await user.click(screen.getByRole('button', { name: /set lockout/i }));
    expect(device.setLockout).toHaveBeenCalledWith(15);

    await user.click(screen.getByRole('tab', { name: 'Advanced' }));
    await user.click(screen.getByRole('button', { name: /set full wipe mode/i }));
    expect(device.setWipeMode).toHaveBeenCalled();
  });
});