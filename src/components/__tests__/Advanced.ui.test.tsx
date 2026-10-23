import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Advanced from '../Advanced';
import { DeviceType } from '../../api/device/types';
import { CONFIG_MODE_REQUIRED } from '../../data/configMode';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';

const wipePages = [
  { name: 'classic', deviceType: DeviceType.CLASSIC },
  { name: 'duo', deviceType: DeviceType.DUO },
];

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

  /*
   * Do not pre-judge config mode. isConfigMode reads false if the app missed
   * the transition (reconnect, already in config mode at startup, DUO no-PIN).
   * Send anyway; firmware accepts or refuses. 3.0.4 refuses OKWIPEPRIV with
   * "Error device locked"; newer firmware says "Error not in config mode".
   */
  it.each(wipePages)(
    '$name: sends a private-key save even when isConfigMode reads false',
    async ({ deviceType }) => {
      const user = userEvent.setup();
      const device = createMockDeviceClient();
      seedDeviceStore({ device, isConfigMode: false, deviceType });
      renderWithProviders(<Advanced />);

      await user.type(
        screen.getByPlaceholderText(/private key/i),
        '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
      );
      await user.click(screen.getAllByRole('button', { name: /save to onlykey/i })[1]);

      expect(device.setPrivateKey).toHaveBeenCalledWith(101, 1, expect.any(Array));
      expect(screen.queryByText(/flashing red led/i)).not.toBeInTheDocument();
      expect(screen.getByText(/private key saved to slot 101/i)).toBeInTheDocument();
    },
  );

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

  it('rejects a short HMAC key and a failed Yubikey save', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    device.setYubiAuth = vi.fn().mockRejectedValue(new Error('yubi failed'));
    seedDeviceStore({ device, isConfigMode: true });
    renderWithProviders(<Advanced />);
    await user.selectOptions(screen.getByLabelText(/^type$/i), '9');
    await user.type(screen.getByPlaceholderText(/private key/i), 'aabb');
    await user.click(screen.getAllByRole('button', { name: /save to onlykey/i })[1]);
    expect(screen.getByText(/hmac key must be 40 hex characters/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/public id/i), 'cccccc');
    await user.type(screen.getByPlaceholderText(/private id/i), '112233');
    await user.type(screen.getByPlaceholderText(/secret aes key/i), 'aabbcc');
    await user.click(screen.getAllByRole('button', { name: /save to onlykey/i })[0]);
    expect(await screen.findByText(/yubi failed/i)).toBeInTheDocument();
  });

  it('surfaces wipe errors and ignores a declined confirm', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    device.wipeYubiAuth = vi.fn().mockRejectedValue(new Error('yubi wipe failed'));
    device.wipePrivateKey = vi.fn().mockRejectedValue(new Error('key wipe failed'));
    seedDeviceStore({ device, isConfigMode: true });
    renderWithProviders(<Advanced />);
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await user.click(screen.getAllByRole('button', { name: /wipe from onlykey/i })[0]);
    expect(device.wipeYubiAuth).not.toHaveBeenCalled();

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getAllByRole('button', { name: /wipe from onlykey/i })[0]);
    expect(await screen.findByText(/yubi wipe failed/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /wipe from onlykey/i })[1]);
    expect(await screen.findByText(/key wipe failed/i)).toBeInTheDocument();
  });

  it('saves SECP256K1 with the decryption modifier', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device, isConfigMode: true });
    renderWithProviders(<Advanced />);
    await user.selectOptions(screen.getByLabelText(/^type$/i), '3');
    await user.selectOptions(screen.getByLabelText(/^slot$/i), '102');
    const hex = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
    await user.type(screen.getByPlaceholderText(/private key/i), hex);
    await user.click(screen.getByLabelText(/set as decryption key/i));
    await user.click(screen.getAllByRole('button', { name: /save to onlykey/i })[1]);
    expect(device.setPrivateKey).toHaveBeenCalledWith(102, 3 + 32, expect.any(Array));
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

  it.each(wipePages)(
    '$name: sends a private-key wipe even when isConfigMode reads false',
    async ({ deviceType }) => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const device = createMockDeviceClient();
      seedDeviceStore({ device, isConfigMode: false, deviceType });
      renderWithProviders(<Advanced />);
      await user.click(screen.getAllByRole('button', { name: /wipe from onlykey/i })[1]);
      expect(device.wipePrivateKey).toHaveBeenCalledWith(101);
      expect(screen.queryByText(/flashing red led/i)).not.toBeInTheDocument();
      expect(screen.getByText(/private key wiped from slot 101/i)).toBeInTheDocument();
    },
  );

  it("surfaces the device's own config-mode refusal instead of guessing", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const device = createMockDeviceClient();
    // Newer firmware: "Error not in config mode" after formatDeviceLockedError.
    device.wipePrivateKey = vi
      .fn()
      .mockRejectedValue(
        new Error('OnlyKey must be in config mode (flashing red LED) for this operation.'),
      );
    seedDeviceStore({ device, isConfigMode: false });
    renderWithProviders(<Advanced />);
    await user.click(screen.getAllByRole('button', { name: /wipe from onlykey/i })[1]);
    expect(device.wipePrivateKey).toHaveBeenCalledWith(101);
    expect(await screen.findByText(/flashing red led/i)).toBeInTheDocument();
  });

  it('surfaces 3.0.4 OKWIPEPRIV locked-as-config-mode copy', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const device = createMockDeviceClient();
    // 3.0.4: "Error device locked" mapped when the app already sees unlocked.
    device.wipePrivateKey = vi.fn().mockRejectedValue(new Error(CONFIG_MODE_REQUIRED));
    seedDeviceStore({ device, isConfigMode: false });
    renderWithProviders(<Advanced />);
    await user.click(screen.getAllByRole('button', { name: /wipe from onlykey/i })[1]);
    expect(device.wipePrivateKey).toHaveBeenCalledWith(101);
    expect(await screen.findByText(CONFIG_MODE_REQUIRED)).toBeInTheDocument();
  });
});
