import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Advanced from '../Advanced';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';

describe('Advanced page', () => {
  it('is hidden without a device', () => {
    seedDeviceStore({ device: null });
    const { container } = renderWithProviders(<Advanced />);
    expect(container).toBeEmptyDOMElement();
  });

  it('requires all Yubikey fields before save', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device });
    renderWithProviders(<Advanced />);

    await user.click(screen.getAllByRole('button', { name: /save to onlykey/i })[0]);
    expect(screen.getByText(/all yubikey fields are required/i)).toBeInTheDocument();
    expect(device.setYubiAuth).not.toHaveBeenCalled();
  });

  it('saves Yubikey security info', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device });
    renderWithProviders(<Advanced />);

    await user.type(screen.getByPlaceholderText(/public id/i), 'cccccc');
    await user.type(screen.getByPlaceholderText(/private id/i), '112233');
    await user.type(screen.getByPlaceholderText(/secret aes key/i), 'aabbcc');
    await user.click(screen.getAllByRole('button', { name: /save to onlykey/i })[0]);

    expect(device.setYubiAuth).toHaveBeenCalledWith('cccccc', '112233', 'aabbcc');
    expect(screen.getByText(/yubikey security info saved/i)).toBeInTheDocument();
  });

  it('blocks private-key save outside config mode', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device, isConfigMode: false });
    renderWithProviders(<Advanced />);

    await user.type(
      screen.getByPlaceholderText(/private key/i),
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
    );
    await user.click(screen.getAllByRole('button', { name: /save to onlykey/i })[1]);

    expect(screen.getByText(/flashing red led/i)).toBeInTheDocument();
    expect(device.setPrivateKey).not.toHaveBeenCalled();
  });

  it('saves an ECC key in config mode', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device, isConfigMode: true });
    renderWithProviders(<Advanced />);

    const hex = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    await user.type(screen.getByPlaceholderText(/private key/i), hex);
    await user.click(screen.getAllByRole('button', { name: /save to onlykey/i })[1]);

    expect(device.setPrivateKey).toHaveBeenCalled();
    expect(screen.getByText(/private key saved to slot 101/i)).toBeInTheDocument();
  });

  it('wipes Yubikey info after confirm', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const device = createMockDeviceClient();
    seedDeviceStore({ device, isConfigMode: true });
    renderWithProviders(<Advanced />);
    await user.click(screen.getAllByRole('button', { name: /wipe from onlykey/i })[0]);
    expect(device.wipeYubiAuth).toHaveBeenCalled();
  });

  it('applies backup/signature modifiers when saving an ECC key', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device, isConfigMode: true });
    renderWithProviders(<Advanced />);
    const hex = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    await user.type(screen.getByPlaceholderText(/private key/i), hex);
    await user.click(screen.getByLabelText(/set as backup key/i));
    await user.click(screen.getByLabelText(/set as signature key/i));
    await user.click(screen.getAllByRole('button', { name: /save to onlykey/i })[1]);
    expect(device.setPrivateKey).toHaveBeenCalledWith(101, 1 + 128 + 64, expect.any(Array));
  });

  it('wipes a private key slot after confirm', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const device = createMockDeviceClient();
    seedDeviceStore({ device, isConfigMode: true });
    renderWithProviders(<Advanced />);
    await user.click(screen.getAllByRole('button', { name: /wipe from onlykey/i })[1]);
    expect(device.wipePrivateKey).toHaveBeenCalledWith(101);
  });
});
