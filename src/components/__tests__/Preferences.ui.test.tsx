import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
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

    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument();
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

  it('saves remaining standard and advanced preferences', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device });
    renderWithProviders(<Preferences />);

    const ledSection = screen.getByText('Indicator Light (LED) Brightness').closest('section')!;
    fireEvent.change(within(ledSection).getByRole('spinbutton'), { target: { value: '8' } });
    await user.click(screen.getByRole('button', { name: /set brightness/i }));
    expect(device.setLedBrightness).toHaveBeenCalledWith(8);

    const lockBtn = screen.getByText('Lock Button').closest('section')!;
    fireEvent.change(within(lockBtn).getByRole('spinbutton'), { target: { value: '6' } });
    await user.click(screen.getByRole('button', { name: /set as lock button/i }));
    expect(device.setLockButton).toHaveBeenCalledWith(6);

    await user.click(screen.getByRole('tab', { name: 'Advanced' }));
    const yesButtons = screen.getAllByRole('button', { name: /^yes$/i });
    const noButtons = screen.getAllByRole('button', { name: /^no$/i });
    await user.click(yesButtons[0]);
    expect(device.setModKeyMode).toHaveBeenCalledWith(1);
    await user.click(noButtons[0]);
    expect(device.setModKeyMode).toHaveBeenCalledWith(0);
    await user.click(yesButtons[1]);
    expect(device.setHmacChallengeMode).toHaveBeenCalledWith(1);
    await user.click(screen.getByRole('button', { name: /lock backup key/i }));
    expect(device.setBackupKeyMode).toHaveBeenCalledWith(1);
  });

  it('writes only the user input families the user chose', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device, version: 'v3.1.0-prodc' });
    renderWithProviders(<Preferences />);
    await user.click(screen.getByRole('tab', { name: 'Advanced' }));

    const save = screen.getByRole('button', { name: /save user input modes/i });
    expect(save).toBeDisabled();
    for (const radio of screen.getAllByRole('radio')) expect(radio).not.toBeChecked();

    const derived = screen.getByRole('group', { name: /^SSH\/GPG derived keys/ });
    const stored = screen.getByRole('group', { name: /^Stored keys/ });
    const web = screen.getByRole('group', { name: /^Web and agent derived keys/ });
    expect(within(derived).queryByRole('radio', { name: /none/i })).toBeNull();
    expect(within(stored).queryByRole('radio', { name: /none/i })).toBeNull();

    await user.click(within(web).getByRole('radio', { name: /^None/ }));
    await user.click(save);
    expect(device.setWebAgentDeriveMode).toHaveBeenCalledWith(2);
    expect(device.setDerivedChallengeMode).not.toHaveBeenCalled();
    expect(device.setStoredChallengeMode).not.toHaveBeenCalled();
  });

  it('says which user input families were saved when a later write fails', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient({
      setWebAgentDeriveMode: vi.fn().mockRejectedValue(new Error('Request OKSETSLOT timed out after 10000ms')),
    });
    seedDeviceStore({ device, version: 'v3.1.0-prodc' });
    renderWithProviders(<Preferences />);
    await user.click(screen.getByRole('tab', { name: 'Advanced' }));

    const derived = screen.getByRole('group', { name: /^SSH\/GPG derived keys/ });
    const web = screen.getByRole('group', { name: /^Web and agent derived keys/ });
    await user.click(within(derived).getByRole('radio', { name: /button press/i }));
    await user.click(within(web).getByRole('radio', { name: /button press/i }));
    await user.click(screen.getByRole('button', { name: /save user input modes/i }));

    expect(device.setDerivedChallengeMode).toHaveBeenCalledWith(1);
    expect(device.setStoredChallengeMode).not.toHaveBeenCalled();
    const err = await screen.findByTestId('pref-error');
    expect(err).toHaveTextContent(/timed out/i);
    expect(err).toHaveTextContent(/already saved: SSH\/GPG derived keys\./i);
  });

  it('a help icon beside a choice does not select it', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device, version: 'v3.1.0-prodc' });
    renderWithProviders(<Preferences />);
    await user.click(screen.getByRole('tab', { name: 'Advanced' }));

    const web = screen.getByRole('group', { name: /^Web and agent derived keys/ });
    const none = within(web).getByRole('radio', { name: /^None/ });
    const row = none.closest('.pref-choice-row') as HTMLElement;
    await user.click(within(row).getByRole('img', { name: 'Help' }));
    expect(none).not.toBeChecked();
    expect(none).toHaveAccessibleName('None (no confirmation) - for unattended agents');
  });

  it('saves Webcrypt access only after a choice, as one policy byte', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device, version: 'v3.1.0-prodc' });
    renderWithProviders(<Preferences />);
    await user.click(screen.getByRole('tab', { name: 'Advanced' }));

    const save = screen.getByRole('button', { name: /save webcrypt access/i });
    expect(save).toBeDisabled();
    const group = screen.getByRole('group', { name: /^The web app can use/ });
    await user.click(within(group).getByRole('radio', { name: /^Derived keys only/ }));
    await user.click(save);
    expect(device.setWebcryptPolicy).toHaveBeenLastCalledWith(0x00);
    await user.click(within(group).getByRole('radio', { name: /^Off/ }));
    await user.click(save);
    expect(device.setWebcryptPolicy).toHaveBeenLastCalledWith(0x02);
    await user.click(within(group).getByRole('radio', { name: /^Stored and derived keys/ }));
    await user.click(save);
    expect(device.setWebcryptPolicy).toHaveBeenLastCalledWith(0x01);
  });

  it('offers only the derived and stored settings on firmware before 3.1.0', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device, version: 'v3.0.4-prodc' });
    renderWithProviders(<Preferences />);
    await user.click(screen.getByRole('tab', { name: 'Advanced' }));

    expect(screen.queryByRole('group', { name: /^Web and agent derived keys/ })).toBeNull();
    expect(screen.queryByText('Webcrypt Access')).toBeNull();
    expect(screen.getByText(/need firmware 3\.1\.0 or later/i)).toBeInTheDocument();

    const stored = screen.getByRole('group', { name: /^Stored keys/ });
    await user.click(within(stored).getByRole('radio', { name: /challenge code/i }));
    await user.click(screen.getByRole('button', { name: /save user input modes/i }));
    expect(device.setStoredChallengeMode).toHaveBeenCalledWith(0);
    expect(device.setWebAgentDeriveMode).not.toHaveBeenCalled();
  });

  it('surfaces preference errors', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient({
      setKbdLayout: vi.fn().mockRejectedValue(new Error('device locked')),
    });
    seedDeviceStore({ device });
    renderWithProviders(<Preferences />);
    await user.click(screen.getByRole('button', { name: /set layout/i }));
    expect(await screen.findByTestId('pref-error')).toHaveTextContent(/device locked/i);
  });

  it('shows one config-mode error on Advanced prefs without the Standard/sysadmin extra line', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient({
      setModKeyMode: vi
        .fn()
        .mockRejectedValue(new Error('OnlyKey must be in config mode (flashing red LED) for this operation.')),
    });
    seedDeviceStore({ device });
    renderWithProviders(<Preferences />);
    await user.click(screen.getByRole('tab', { name: 'Advanced' }));
    await user.click(screen.getAllByRole('button', { name: /^yes$/i })[0]);
    const err = await screen.findByTestId('pref-error');
    expect(err).toHaveTextContent(/flashing red led/i);
    expect(err).not.toHaveTextContent(/sysadmin mode is on/i);
    expect(err).not.toHaveTextContent(/standard preference/i);
    expect(screen.getAllByTestId('pref-error')).toHaveLength(1);
  });

  it('adds the Sysadmin hint when a Standard pref is refused for config mode', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient({
      setKbdLayout: vi
        .fn()
        .mockRejectedValue(new Error('OnlyKey must be in config mode (flashing red LED) for this operation.')),
    });
    seedDeviceStore({ device });
    renderWithProviders(<Preferences />);
    await user.click(screen.getByRole('button', { name: /set layout/i }));
    const err = await screen.findByTestId('pref-error');
    expect(err).toHaveTextContent(/flashing red led/i);
    expect(err).toHaveTextContent(/sysadmin mode/i);
  });
});