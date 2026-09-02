import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Setup from '../Setup';
import { DeviceType } from '../../api/device/types';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';
import * as keyImportService from '../../services/keyImport/keyImportService';
import * as keyBundleParser from '../../services/keyImport/keyBundleParser';

vi.mock('../../services/keyImport/keyImportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/keyImport/keyImportService')>();
  return {
    ...actual,
    importPemKey: vi.fn().mockResolvedValue({ loadedCount: 1, usedSelection: false }),
  };
});

vi.mock('../../services/keyImport/keyBundleParser', () => ({
  parseKeyBundle: vi.fn(),
}));

const pgpPem = '-----BEGIN PGP PRIVATE KEY BLOCK-----';

describe('Setup page', () => {
  beforeEach(() => {
    vi.mocked(keyImportService.importPemKey).mockReset();
    vi.mocked(keyImportService.importPemKey).mockResolvedValue({ loadedCount: 1, usedSelection: false });
    vi.mocked(keyBundleParser.parseKeyBundle).mockReset();
  });

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
    expect(screen.getByText(/hold down button #6/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set backup passphrase/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change primary pin/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change self-destruct pin/i })).toBeInTheDocument();
  });

  it('walks guided Classic PIN, PIN2, and self-destruct steps', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin', 'prompt'));
    expect(screen.getByRole('heading', { name: /re-enter pin on onlykey keypad/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByRole('heading', { name: /enter pin for second profile/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /don't want a second profile/i }));
    expect(await screen.findByRole('heading', { name: /self-destruct pin/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /don't want a self-destruct pin/i }));
    expect(screen.getByRole('heading', { name: /enter a backup passphrase/i })).toBeInTheDocument();
    const passphrase = 'this passphrase is not complex!!';
    fireEvent.change(screen.getByLabelText(/^enter passphrase$/i), { target: { value: passphrase } });
    fireEvent.change(screen.getByLabelText(/^re-enter passphrase$/i), { target: { value: passphrase } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByRole('heading', { name: /restore from backup/i })).toBeInTheDocument();
    const restoreInputs = document.querySelectorAll('#Step10 input[type="file"]');
    expect(restoreInputs).toHaveLength(1);
    expect(restoreInputs[0]).toHaveClass('ok-file-input');
    const restoreFile = new File(['SGk='], 'backup.txt', { type: 'text/plain' });
    await user.upload(restoreInputs[0] as HTMLInputElement, restoreFile);
    await waitFor(() => expect(device.restore).toHaveBeenCalled());
  });

  it('locks the backup key when advanced uninitialized setup is enabled', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin', 'prompt'));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(await screen.findByRole('button', { name: /don't want a second profile/i }));
    await user.click(await screen.findByRole('button', { name: /don't want a self-destruct pin/i }));
    expect(screen.getByRole('heading', { name: /enter a backup passphrase/i })).toBeInTheDocument();
    await user.click(screen.getByLabelText(/permit future backup key changes/i));
    await user.click(screen.getByLabelText(/lock backup key on this device/i));
    const passphrase = 'this passphrase is not complex!!';
    fireEvent.change(screen.getByLabelText(/^enter passphrase$/i), { target: { value: passphrase } });
    fireEvent.change(screen.getByLabelText(/^re-enter passphrase$/i), { target: { value: passphrase } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => {
      expect(device.setBackupKeyMode).toHaveBeenCalledWith(1);
      expect(device.setBackupPassphrase).toHaveBeenCalledWith(passphrase);
    });
  });

  it('enables advanced setup on an uninitialized device', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
    });
    renderWithProviders(<Setup />);
    const advanced = screen.getByRole('checkbox');
    await user.click(advanced);
    expect(advanced).toBeChecked();
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('heading', { name: /enter pin on onlykey keypad/i })).toBeInTheDocument();
  });

  it('starts guided setup from an uninitialized Classic device', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(screen.getByRole('heading', { name: /enter pin on onlykey keypad/i })).toBeInTheDocument();
  });

  it('rejects mismatched DUO device and self-destruct PINs', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.DUO,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /set or change onlykey duo pins/i }));
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    fireEvent.change(screen.getByPlaceholderText('Device PIN'), { target: { value: '3253614' } });
    fireEvent.change(screen.getAllByPlaceholderText('Confirm')[0], { target: { value: '3253615' } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByText(/pins do not match/i)).toBeInTheDocument();

    fireEvent.change(screen.getAllByPlaceholderText('Confirm')[0], { target: { value: '3253614' } });
    fireEvent.change(screen.getByPlaceholderText(/self-destruct pin/i), { target: { value: '6543216' } });
    fireEvent.change(screen.getAllByPlaceholderText('Confirm')[1], { target: { value: '6543215' } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByText(/self-destruct pins do not match/i)).toBeInTheDocument();
  });

  it('submits DUO PINs after accepting the disclaimer', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.DUO,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /set or change onlykey duo pins/i }));
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    fireEvent.change(screen.getByPlaceholderText('Device PIN'), { target: { value: '3253614' } });
    fireEvent.change(screen.getAllByPlaceholderText('Confirm')[0], { target: { value: '3253614' } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => {
      expect(device.sendPinDUO).toHaveBeenCalledWith(['3253614', '', ''], true);
    });
  });

  it('uses beginClassicPinEntry for secondary and self-destruct PIN steps', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.CLASSIC,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /change secondary pin/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin2', 'prompt'));
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    expect(screen.getByRole('button', { name: /^next$/i })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin2', 'commit'));
    expect(await screen.findByRole('heading', { name: /re-enter pin/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    await user.click(screen.getByRole('button', { name: /change self-destruct pin/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('sdpin', 'prompt'));
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('sdpin', 'commit'));
  });

  it('loads firmware blocks immediately while in bootloader', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
      isBootloader: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /load firmware/i }));
    const file = new File(['-----BEGIN SIGNED FIRMWARE-----\naabb\n'], 'fw.txt', { type: 'text/plain' });
    const inputs = document.querySelectorAll('input[type="file"]');
    await user.upload(inputs[inputs.length - 1] as HTMLInputElement, file);
    await waitFor(() => {
      expect(device.loadFirmwareBlocks).toHaveBeenCalled();
    });
    expect(sessionStorage.getItem('ok-pending-firmware')).toBeNull();
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

    expect(screen.getByText(/hold down button #1 on your onlykey duo/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /set or change onlykey duo pins/i }));
    expect(screen.getByRole('heading', { name: /set or change pins/i })).toBeInTheDocument();
    expect(screen.getByText(/i understand and accept the above risk/i)).toBeInTheDocument();
  });

  async function openClassicPgpStep(user: ReturnType<typeof userEvent.setup>) {
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /set backup passphrase/i }));
    await user.click(screen.getByRole('button', { name: /use openpgp key instead of passphrase/i }));
    expect(screen.getByRole('heading', { name: /set a backup key/i })).toBeInTheDocument();
  }

  it('toggles PGP backup-key options and returns to the passphrase form', async () => {
    const user = userEvent.setup();
    await openClassicPgpStep(user);
    await user.selectOptions(screen.getByRole('combobox'), '2');
    await user.click(screen.getByLabelText(/lock backup key on this device/i));
    await user.click(screen.getByRole('button', { name: /use passphrase instead of pgp key/i }));
    expect(screen.getByRole('heading', { name: /enter a backup passphrase/i })).toBeInTheDocument();
  });

  it('opens the PGP backup-key step from the passphrase form', async () => {
    const user = userEvent.setup();
    await openClassicPgpStep(user);
    expect(screen.getByPlaceholderText(/paste pem/i)).toBeInTheDocument();
  });

  it('passes the signature flag into importPemKey', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.CLASSIC,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /set backup passphrase/i }));
    await user.click(screen.getByRole('button', { name: /use openpgp key instead of passphrase/i }));
    fireEvent.change(screen.getByPlaceholderText(/paste pem/i), { target: { value: pgpPem } });
    fireEvent.change(screen.getByLabelText(/^passphrase/i), { target: { value: 'secret' } });
    await user.click(screen.getByLabelText(/set as signature key/i));
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    await waitFor(() => {
      expect(keyImportService.importPemKey).toHaveBeenCalledWith(
        device,
        expect.objectContaining({
          pem: pgpPem,
          passcode: 'secret',
          setAsBackup: true,
          setAsSignature: true,
        }),
      );
    });
    expect(device.setBackupKeyMode).toHaveBeenCalledWith(0);
  });

  it('saves a backup passphrase of at least 25 characters', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.CLASSIC,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /set backup passphrase/i }));
    const passphrase = 'this passphrase is not complex!!';
    fireEvent.change(screen.getByLabelText(/^enter passphrase$/i), { target: { value: passphrase } });
    fireEvent.change(screen.getByLabelText(/^re-enter passphrase$/i), { target: { value: passphrase } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => {
      expect(device.setBackupPassphrase).toHaveBeenCalledWith(passphrase);
    });
    await user.click(screen.getByRole('button', { name: /set backup passphrase/i }));
    expect(screen.getByLabelText(/^enter passphrase$/i)).toHaveValue('');
    expect(screen.getByLabelText(/^re-enter passphrase$/i)).toHaveValue('');
  });

  it('does not store pending firmware when the bootloader kick fails', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient({
      triggerBootloader: vi.fn().mockRejectedValue(new Error('Error: Not in Config Mode')),
    });
    seedDeviceStore({
      device,
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
      isBootloader: false,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /load firmware/i }));
    const file = new File(['-----BEGIN SIGNED FIRMWARE-----\naabb\n'], 'fw.txt', { type: 'text/plain' });
    const inputs = document.querySelectorAll('input[type="file"]');
    await user.upload(inputs[inputs.length - 1] as HTMLInputElement, file);

    await waitFor(() => {
      expect(device.triggerBootloader).toHaveBeenCalled();
    });
    expect(sessionStorage.getItem('ok-pending-firmware')).toBeNull();
    expect(screen.getByText(/not in config mode/i)).toBeInTheDocument();
  });

  it('stores pending firmware only after a successful bootloader kick', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
      isBootloader: false,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /load firmware/i }));
    const file = new File(['-----BEGIN SIGNED FIRMWARE-----\naabb\n'], 'fw.txt', { type: 'text/plain' });
    const inputs = document.querySelectorAll('input[type="file"]');
    await user.upload(inputs[inputs.length - 1] as HTMLInputElement, file);

    await waitFor(() => {
      expect(device.triggerBootloader).toHaveBeenCalled();
    });
    expect(JSON.parse(sessionStorage.getItem('ok-pending-firmware') ?? 'null')).toEqual(['aabb']);
    expect(device.firmwareUpdate).not.toHaveBeenCalled();
  });

  it('uses beginClassicPinEntry for Classic keypad PIN setup, not 10s setPin', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.CLASSIC,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /change primary pin/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin', 'prompt'));
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin', 'commit'));
    expect(device.setPin).not.toHaveBeenCalled();
    expect(await screen.findByRole('heading', { name: /re-enter pin/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByRole('button', { name: /change primary pin/i })).toBeInTheDocument();
    expect(device.cancelClassicPinEntry).not.toHaveBeenCalled();
  });

  it('keeps the backup passphrase field focused while typing', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /set backup passphrase/i }));
    const input = screen.getByLabelText(/^enter passphrase$/i);
    await user.type(input, 'this passphrase is not complex!!');
    expect(input).toHaveValue('this passphrase is not complex!!');
    expect(input).toHaveFocus();
  });

  it('cancels a Change PIN step that is still waiting on the device', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const hanging = new Promise<void>((resolve) => {
      release = resolve;
    });
    const beginClassicPinEntry = vi.fn().mockReturnValue(hanging);
    const cancelClassicPinEntry = vi.fn().mockImplementation(async () => {
      release();
    });
    seedDeviceStore({
      device: createMockDeviceClient({ beginClassicPinEntry, cancelClassicPinEntry }),
      deviceType: DeviceType.CLASSIC,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /change primary pin/i }));
    const cancel = await screen.findByRole('button', { name: /cancel/i });
    expect(cancel).toBeEnabled();
    expect(screen.getByRole('button', { name: /^next$/i })).toHaveTextContent(/^next$/i);
    await user.click(cancel);
    expect(cancelClassicPinEntry).toHaveBeenCalledWith('pin');
    expect(screen.getByRole('button', { name: /change primary pin/i })).toBeInTheDocument();
  });

  it('lets each Change PIN action be opened after Cancel', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.CLASSIC,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);

    await user.click(screen.getByRole('button', { name: /change primary pin/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await user.click(screen.getByRole('button', { name: /change secondary pin/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await user.click(screen.getByRole('button', { name: /change self-destruct pin/i }));

    expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin', 'prompt');
    expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin2', 'prompt');
    expect(device.beginClassicPinEntry).toHaveBeenCalledWith('sdpin', 'prompt');
    expect(device.cancelClassicPinEntry).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled();
  });

  it('validates backup passphrase and returns to the landing page on cancel', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /set backup passphrase/i }));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByText(/passphrase cannot be empty/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^enter passphrase$/i), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText(/^re-enter passphrase$/i), { target: { value: 'short' } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(document.querySelector('.critical-text')).toHaveTextContent(/at least 25 characters/i);

    fireEvent.change(screen.getByLabelText(/^enter passphrase$/i), {
      target: { value: 'this passphrase is not complex!!' },
    });
    fireEvent.change(screen.getByLabelText(/^re-enter passphrase$/i), {
      target: { value: 'this passphrase is different!!!!' },
    });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(document.querySelector('.critical-text')).toHaveTextContent(/do not match/i);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('button', { name: /set backup passphrase/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /set backup passphrase/i }));
    expect(screen.getByLabelText(/^enter passphrase$/i)).toHaveValue('');
    expect(screen.getByLabelText(/^re-enter passphrase$/i)).toHaveValue('');
  });

  it('requires an OpenPGP key and passcode before import', async () => {
    const user = userEvent.setup();
    await openClassicPgpStep(user);
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByText(/cannot be empty/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/paste pem/i), { target: { value: pgpPem } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByText(/passcode cannot be empty/i)).toBeInTheDocument();
  });

  it('shows a firmware parse error for a non-firmware file', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /load firmware/i }));
    const badFw = new File(['nope'], 'fw.txt', { type: 'text/plain' });
    const fwInputs = document.querySelectorAll('input[type="file"]');
    await user.upload(fwInputs[fwInputs.length - 1] as HTMLInputElement, badFw);
    expect(await screen.findByText(/invalid hex|could not parse firmware/i)).toBeInTheDocument();
  });

  it('sets DUO self-destruct PIN and skips it when declined', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.DUO,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /set or change onlykey duo pins/i }));
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    fireEvent.change(screen.getByPlaceholderText('Device PIN'), { target: { value: '3253614' } });
    fireEvent.change(screen.getAllByPlaceholderText('Confirm')[0], { target: { value: '3253614' } });
    fireEvent.change(screen.getByPlaceholderText(/self-destruct pin/i), { target: { value: '1111111' } });
    fireEvent.change(screen.getAllByPlaceholderText('Confirm')[1], { target: { value: '1111111' } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => {
      expect(device.sendPinDUO).toHaveBeenCalledWith(['3253614', '', '1111111'], true);
    });
  });

  it('opens the subkey picker when import throws KEY_SELECTION_REQUIRED', async () => {
    const user = userEvent.setup();
    vi.mocked(keyImportService.importPemKey).mockRejectedValueOnce(new Error('KEY_SELECTION_REQUIRED'));
    vi.mocked(keyBundleParser.parseKeyBundle).mockResolvedValue({
      requiresSelection: true,
      assignments: [],
      candidates: [
        { id: '0', name: 'Primary Key', type: 2, keyData: [1], kind: 'rsa' },
        { id: '1', name: 'Subkey 1', type: 2, keyData: [2], kind: 'rsa' },
      ],
    });

    await openClassicPgpStep(user);
    fireEvent.change(screen.getByPlaceholderText(/paste pem/i), { target: { value: pgpPem } });
    fireEvent.change(screen.getByLabelText(/^passphrase/i), { target: { value: 'secret' } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));

    expect(await screen.findByRole('heading', { name: /select private key/i })).toBeInTheDocument();
    expect(screen.getByText('Subkey 1')).toBeInTheDocument();
    expect(screen.queryByText('KEY_SELECTION_REQUIRED')).not.toBeInTheDocument();
  });

  it('loads the selected OpenPGP subkey from the picker and can cancel it', async () => {
    const user = userEvent.setup();
    vi.mocked(keyImportService.importPemKey)
      .mockRejectedValueOnce(new Error('KEY_SELECTION_REQUIRED'))
      .mockRejectedValueOnce(new Error('KEY_SELECTION_REQUIRED'))
      .mockResolvedValue({ loadedCount: 1, usedSelection: true });
    vi.mocked(keyBundleParser.parseKeyBundle).mockResolvedValue({
      requiresSelection: true,
      assignments: [],
      candidates: [
        { id: '0', name: 'Primary Key', type: 2, keyData: [1], kind: 'rsa' },
        { id: '1', name: 'Subkey 1', type: 2, keyData: [2], kind: 'rsa' },
      ],
    });

    await openClassicPgpStep(user);
    fireEvent.change(screen.getByPlaceholderText(/paste pem/i), { target: { value: pgpPem } });
    fireEvent.change(screen.getByLabelText(/^passphrase/i), { target: { value: 'secret' } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByRole('heading', { name: /select private key/i })).toBeInTheDocument();

    const dialog = screen.getByRole('heading', { name: /select private key/i }).closest('.fixed');
    expect(dialog).toBeTruthy();
    await user.click(within(dialog as HTMLElement).getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('heading', { name: /select private key/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByRole('heading', { name: /select private key/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /load key/i }));
    await waitFor(() => {
      expect(keyImportService.importPemKey).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ selectedCandidateId: '0', targetSlot: 1 }),
      );
    });
  });

  it('warns when an initialized DUO is locked out of config mode', () => {
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.DUO,
      isLocked: true,
      isConfigMode: false,
    });
    renderWithProviders(<Setup />);
    expect(screen.getByText(/put your onlykey duo into config mode before continuing/i)).toBeInTheDocument();
  });

  it('toggles DUO backup passphrase and OpenPGP steps', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.DUO,
      isLocked: false,
      isConfigMode: true,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /set backup passphrase/i }));
    expect(screen.getByRole('heading', { name: /enter a backup passphrase/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /use openpgp key instead of passphrase/i }));
    expect(screen.getByRole('heading', { name: /set a backup key/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /use passphrase instead of pgp key/i }));
    expect(screen.getByRole('heading', { name: /enter a backup passphrase/i })).toBeInTheDocument();
  });

  it('sets a plausible-deniability second profile during advanced Classic setup', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin', 'prompt'));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByRole('heading', { name: /enter pin for second profile/i })).toBeInTheDocument();
    await user.click(screen.getByLabelText(/plausible deniability profile/i));
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => {
      expect(device.setSecProfileMode).toHaveBeenCalledWith(2);
      expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin2', 'commit');
    });
    expect(await screen.findByRole('heading', { name: /re-enter pin for second profile/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByRole('heading', { name: /self-destruct pin/i })).toBeInTheDocument();
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('sdpin', 'prompt'));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByRole('heading', { name: /enter a backup passphrase/i })).toBeInTheDocument();
  });

  it('reports restore progress including the apply phase', async () => {
    const user = userEvent.setup();
    const restore = vi.fn(async (_hex: string, onProgress?: (pct: number) => void) => {
      onProgress?.(40);
      onProgress?.(96);
    });
    const device = createMockDeviceClient({ restore });
    seedDeviceStore({
      device,
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(screen.getByLabelText(/i understand and accept the above risk/i));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await waitFor(() => expect(device.beginClassicPinEntry).toHaveBeenCalledWith('pin', 'prompt'));
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    await user.click(await screen.findByRole('button', { name: /don't want a second profile/i }));
    await user.click(await screen.findByRole('button', { name: /don't want a self-destruct pin/i }));
    const passphrase = 'this passphrase is not complex!!';
    fireEvent.change(screen.getByLabelText(/^enter passphrase$/i), { target: { value: passphrase } });
    fireEvent.change(screen.getByLabelText(/^re-enter passphrase$/i), { target: { value: passphrase } });
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByRole('heading', { name: /restore from backup/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    const restoreFile = new File(['SGk='], 'backup.txt', { type: 'text/plain' });
    const restoreInputs = document.querySelectorAll('#Step10 input[type="file"]');
    await user.upload(restoreInputs[restoreInputs.length - 1] as HTMLInputElement, restoreFile);
    await waitFor(() => expect(restore).toHaveBeenCalled());
  });

  it('styles the firmware file chooser as an app button', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.UNINITIALIZED,
      isLocked: false,
    });
    renderWithProviders(<Setup />);
    await user.click(screen.getByRole('button', { name: /load firmware/i }));
    const fwInputs = document.querySelectorAll('#Step11 input[type="file"]');
    expect(fwInputs).toHaveLength(1);
    expect(fwInputs[0]).toHaveClass('ok-file-input');
    await user.click(screen.getByRole('button', { name: /load firmware to onlykey/i }));
  });
});
