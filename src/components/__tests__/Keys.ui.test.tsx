import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Keys from '../Keys';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';
import * as keyImportService from '../../services/keyImport/keyImportService';
import * as keyService from '../../services/keys/keyService';
import * as keyBundleParser from '../../services/keyImport/keyBundleParser';

vi.mock('../../services/keyImport/keyImportService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/keyImport/keyImportService')>();
  return {
    ...actual,
    importPemKey: vi.fn().mockResolvedValue({ loadedCount: 1, usedSelection: false }),
  };
});

vi.mock('../../services/keys/keyService', () => ({
  wipeKeyInSlot: vi.fn().mockResolvedValue(undefined),
}));

describe('Keys page', () => {
  beforeEach(() => {
    vi.mocked(keyImportService.importPemKey).mockClear();
    vi.mocked(keyService.wipeKeyInSlot).mockClear();
  });

  it('is hidden without a device', () => {
    seedDeviceStore({ device: null });
    const { container } = renderWithProviders(<Keys />);
    expect(container).toBeEmptyDOMElement();
  });

  it('disables save until a key is pasted', () => {
    seedDeviceStore({ device: createMockDeviceClient() });
    renderWithProviders(<Keys />);
    expect(screen.getByRole('button', { name: /save to onlykey/i })).toBeDisabled();
  });

  it('imports a pasted PEM key', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device });
    renderWithProviders(<Keys />);

    await user.type(screen.getByPlaceholderText(/paste pem/i), '-----BEGIN OPENSSH PRIVATE KEY-----');
    await user.click(screen.getByRole('button', { name: /save to onlykey/i }));

    expect(keyImportService.importPemKey).toHaveBeenCalledWith(
      device,
      expect.objectContaining({
        pem: '-----BEGIN OPENSSH PRIVATE KEY-----',
        slotChoice: 99,
      })
    );
  });

  it('wipes the auto-load slot after confirm', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const device = createMockDeviceClient();
    seedDeviceStore({ device });
    renderWithProviders(<Keys />);

    await user.click(screen.getByRole('button', { name: /wipe from onlykey/i }));
    expect(keyService.wipeKeyInSlot).toHaveBeenCalledWith(device, 99);
  });

  it('opens the subkey picker when import requires selection', async () => {
    const user = userEvent.setup();
    vi.mocked(keyImportService.importPemKey).mockRejectedValueOnce(new Error('KEY_SELECTION_REQUIRED'));
    vi.spyOn(keyBundleParser, 'parseKeyBundle').mockResolvedValue({
      requiresSelection: true,
      assignments: [],
      candidates: [
        { id: '0', name: 'Primary Key', type: 2, keyData: [1], kind: 'rsa' },
        { id: '1', name: 'Subkey 1', type: 2, keyData: [2], kind: 'rsa' },
      ],
    });
    seedDeviceStore({ device: createMockDeviceClient() });
    renderWithProviders(<Keys />);
    await user.type(screen.getByPlaceholderText(/paste pem/i), '-----BEGIN PGP PRIVATE KEY BLOCK-----');
    await user.click(screen.getByRole('button', { name: /save to onlykey/i }));
    expect(await screen.findByRole('heading', { name: /select private key/i })).toBeInTheDocument();
  });

  it('passes setAsBackup and surfaces wipe errors', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(keyService.wipeKeyInSlot).mockRejectedValueOnce(new Error('wipe failed'));
    seedDeviceStore({ device: createMockDeviceClient() });
    renderWithProviders(<Keys />);
    await user.type(screen.getByPlaceholderText(/paste pem/i), '-----BEGIN OPENSSH PRIVATE KEY-----');
    await user.click(screen.getByLabelText(/set as backup key/i));
    await user.click(screen.getByRole('button', { name: /save to onlykey/i }));
    expect(keyImportService.importPemKey).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ setAsBackup: true }),
    );
    await user.click(screen.getByRole('button', { name: /wipe from onlykey/i }));
    expect(await screen.findByText(/wipe failed/i)).toBeInTheDocument();
  });

  it('surfaces a generic import error and ignores a declined wipe', async () => {
    const user = userEvent.setup();
    vi.mocked(keyImportService.importPemKey).mockRejectedValueOnce(new Error('bad pem'));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    seedDeviceStore({ device: createMockDeviceClient() });
    renderWithProviders(<Keys />);
    await user.type(screen.getByPlaceholderText(/paste pem/i), '-----BEGIN OPENSSH PRIVATE KEY-----');
    await user.type(screen.getByLabelText(/passphrase/i), 'secret');
    await user.selectOptions(screen.getByRole('combobox'), '1');
    await user.click(screen.getByRole('button', { name: /save to onlykey/i }));
    expect(await screen.findByText(/bad pem/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /wipe from onlykey/i }));
    expect(keyService.wipeKeyInSlot).not.toHaveBeenCalled();
  });

  it('loads the chosen subkey from the picker', async () => {
    const user = userEvent.setup();
    vi.mocked(keyImportService.importPemKey)
      .mockRejectedValueOnce(new Error('KEY_SELECTION_REQUIRED'))
      .mockResolvedValue({ loadedCount: 1, usedSelection: true });
    vi.spyOn(keyBundleParser, 'parseKeyBundle').mockResolvedValue({
      requiresSelection: true,
      assignments: [],
      candidates: [
        { id: '0', name: 'Primary Key', type: 2, keyData: [1], kind: 'rsa' },
        { id: '1', name: 'Subkey 1', type: 2, keyData: [2], kind: 'rsa' },
      ],
    });
    seedDeviceStore({ device: createMockDeviceClient() });
    renderWithProviders(<Keys />);
    await user.type(screen.getByPlaceholderText(/paste pem/i), '-----BEGIN PGP PRIVATE KEY BLOCK-----');
    await user.click(screen.getByRole('button', { name: /save to onlykey/i }));
    expect(await screen.findByRole('heading', { name: /select private key/i })).toBeInTheDocument();
    await user.click(screen.getByText('Subkey 1'));
    await user.click(screen.getByRole('button', { name: /load key/i }));
    await waitFor(() => {
      expect(keyImportService.importPemKey).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ selectedCandidateId: '1' }),
      );
    });
  });
});
