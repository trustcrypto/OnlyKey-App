import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
});
