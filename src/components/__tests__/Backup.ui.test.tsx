import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Backup from '../Backup';
import { DeviceType } from '../../api/device/types';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';
import * as backupService from '../../services/backup/backupService';

describe('Backup page', () => {
  it('is hidden without a device', () => {
    seedDeviceStore({ device: null });
    const { container } = renderWithProviders(<Backup />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders backup and restore tabs', async () => {
    const user = userEvent.setup();
    seedDeviceStore({ device: createMockDeviceClient(), deviceType: DeviceType.CLASSIC });
    renderWithProviders(<Backup />);

    expect(screen.getByRole('heading', { name: 'Backup / Restore', exact: true })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Backup' })).toHaveClass('pseudo-tab--active');
    expect(screen.getByText(/hold the #1 button down/i)).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Restore' }));
    expect(screen.getByText(/hold down button #6/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /restore to onlykey/i })).toBeDisabled();
  });

  it('shows DUO-specific restore instructions', async () => {
    const user = userEvent.setup();
    seedDeviceStore({ device: createMockDeviceClient(), deviceType: DeviceType.DUO });
    renderWithProviders(<Backup />);

    await user.click(screen.getByRole('tab', { name: 'Restore' }));
    expect(screen.getByText(/hold down button #1 on your onlykey duo/i)).toBeInTheDocument();
  });

  it('disables verify and save until backup data is entered', async () => {
    const user = userEvent.setup();
    seedDeviceStore({ device: createMockDeviceClient() });
    renderWithProviders(<Backup />);

    const verify = screen.getByRole('button', { name: /verify backup/i });
    const save = screen.getByRole('button', { name: /save file/i });
    expect(verify).toBeDisabled();
    expect(save).toBeDisabled();

    const invalidBackup =
      '-----BEGIN ONLYKEY BACKUP-----\nYWJj\n-----END ONLYKEY BACKUP-----';
    await user.type(screen.getByPlaceholderText(/do not type in this field/i), invalidBackup);
    expect(verify).toBeEnabled();
    expect(save).toBeEnabled();

    await user.click(verify);
    expect(screen.getByText(/does not support verification/i)).toBeInTheDocument();
  });

  it('restores a selected backup file', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    vi.spyOn(backupService, 'restoreBackupFromFile').mockResolvedValue(undefined);
    seedDeviceStore({ device, deviceType: DeviceType.CLASSIC });
    renderWithProviders(<Backup />);

    await user.click(screen.getByRole('tab', { name: 'Restore' }));
    const file = new File(['SGk='], 'backup.txt', { type: 'text/plain' });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);

    await user.click(screen.getByRole('button', { name: /restore to onlykey/i }));
    await waitFor(() => {
      expect(backupService.restoreBackupFromFile).toHaveBeenCalled();
    });
    expect(screen.getByText(/backup loaded/i)).toBeInTheDocument();
  });
});