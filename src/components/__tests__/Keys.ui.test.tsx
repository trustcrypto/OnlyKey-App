import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Keys from '../Keys';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';
import * as keyImportService from '../../services/keyImport/keyImportService';
import * as keyService from '../../services/keys/keyService';

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
});
