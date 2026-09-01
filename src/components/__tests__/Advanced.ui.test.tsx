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

  /*
   * THE APP MUST NOT PRE-JUDGE CONFIG MODE.
   *
   * A user reported "unable to wipe key, says to put into config mode even when
   * it is in config mode". The cause was a client-side gate here that refused to
   * send when the store's isConfigMode read false - and it reads false whenever
   * the app missed the one transition that sets it, such as starting up with the
   * key already in config mode. The device was willing the whole time;
   * onlykey-testing/test/01-protocol/27-config-mode-observability.test.js
   * measures the firmware accepting OKWIPEPRIV in exactly that state.
   *
   * The legacy app never gated on this - it sent and let the device answer - so
   * the gate was a regression introduced by the rewrite. These pin the fix: the
   * command goes out regardless of the flag, and the device's own refusal is
   * what the user sees.
   */
  it('sends a private-key save even when isConfigMode reads false', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({ device, isConfigMode: false });
    renderWithProviders(<Advanced />);

    await user.type(
      screen.getByPlaceholderText(/private key/i),
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
    );
    await user.click(screen.getAllByRole('button', { name: /save to onlykey/i })[1]);

    expect(device.setPrivateKey).toHaveBeenCalledWith(101, 1, expect.any(Array));
    expect(screen.queryByText(/flashing red led/i)).not.toBeInTheDocument();
  });

  it('sends a private-key wipe even when isConfigMode reads false', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const device = createMockDeviceClient();
    seedDeviceStore({ device, isConfigMode: false });
    renderWithProviders(<Advanced />);

    await user.click(screen.getAllByRole('button', { name: /wipe from onlykey/i })[1]);

    expect(device.wipePrivateKey).toHaveBeenCalledWith(101);
    expect(screen.queryByText(/flashing red led/i)).not.toBeInTheDocument();
  });

  it("surfaces the device's own config-mode refusal instead of guessing", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const device = createMockDeviceClient();
    /* What OnlyKeyDevice.formatDeviceLockedError already makes of the firmware's
     * "Error not in config mode" - which OKWIPEPRIV now returns for this state. */
    device.wipePrivateKey = vi
      .fn()
      .mockRejectedValue(new Error('OnlyKey must be in config mode (flashing red LED) for this operation.'));
    seedDeviceStore({ device, isConfigMode: false });
    renderWithProviders(<Advanced />);

    await user.click(screen.getAllByRole('button', { name: /wipe from onlykey/i })[1]);

    expect(device.wipePrivateKey).toHaveBeenCalledWith(101);
    expect(await screen.findByText(/flashing red led/i)).toBeInTheDocument();
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
});
