import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Firmware from '../Firmware';
import { DeviceType } from '../../api/device/types';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';
import * as firmwareDownload from '../../desktop/firmwareDownload';

describe('Firmware page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('shows only the config mode error when bootloader trigger fails', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    device.triggerBootloader = vi.fn().mockRejectedValue(new Error('Error: Not in Config Mode'));

    vi.spyOn(firmwareDownload, 'fetchLatestFirmwareRelease').mockResolvedValue({
      version: 'v2.1.2',
      blocks: ['deadbeef'],
      downloadUrl: 'https://example.com/fw.txt',
      sha256: 'abc',
    });

    seedDeviceStore({
      device,
      deviceType: DeviceType.CLASSIC,
      version: 'v2.1.1 STD',
      fwUpdateSupport: true,
      isBootloader: false,
    });

    renderWithProviders(<Firmware />);
    await user.click(screen.getByRole('button', { name: /download latest firmware/i }));

    await waitFor(() => {
      expect(screen.getByText(/not in config mode/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/triggering reboot/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/rebooting to bootloader/i)).not.toBeInTheDocument();
    expect(sessionStorage.getItem('ok-pending-firmware')).toBeNull();
    expect(device.triggerBootloader).toHaveBeenCalledTimes(1);
  });

  it('is hidden without a device', () => {
    seedDeviceStore({ device: null });
    const { container } = renderWithProviders(<Firmware />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows outdated-firmware copy when in-app updates are unsupported', () => {
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      fwUpdateSupport: false,
      isBootloader: false,
      version: 'v0.2-beta.6',
    });
    renderWithProviders(<Firmware />);
    expect(screen.getByText(/does not support this feature/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download latest firmware/i })).not.toBeInTheDocument();
  });

  it('loads firmware blocks directly while in bootloader mode', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    vi.spyOn(firmwareDownload, 'fetchLatestFirmwareRelease').mockResolvedValue({
      version: 'v3.0.4',
      blocks: ['aa', 'bb'],
      downloadUrl: 'https://example.com/fw.txt',
      sha256: 'abc',
    });
    seedDeviceStore({
      device,
      deviceType: DeviceType.CLASSIC,
      fwUpdateSupport: true,
      isBootloader: true,
      version: 'v3.0.0',
    });
    renderWithProviders(<Firmware />);

    sessionStorage.setItem('ok-pending-firmware', JSON.stringify(['stale']));
    await user.click(screen.getByRole('button', { name: /download latest firmware/i }));
    await waitFor(() => {
      expect(device.loadFirmwareBlocks).toHaveBeenCalledWith(['aa', 'bb'], expect.any(Function));
    });
    expect(device.triggerBootloader).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('ok-pending-firmware')).toBeNull();
    expect(screen.getByText(/firmware load complete/i)).toBeInTheDocument();
  });

  it('clears leftover pending after a successful local file load in bootloader', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    sessionStorage.setItem('ok-pending-firmware', JSON.stringify(['stale']));
    seedDeviceStore({
      device,
      deviceType: DeviceType.CLASSIC,
      fwUpdateSupport: true,
      isBootloader: true,
      version: 'v3.0.0',
    });
    renderWithProviders(<Firmware />);
    const file = new File(['-----BEGIN SIGNED FIRMWARE-----\naabb\n'], 'fw.txt', { type: 'text/plain' });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.click(screen.getByRole('button', { name: /load firmware to onlykey/i }));
    await waitFor(() => {
      expect(device.loadFirmwareBlocks).toHaveBeenCalledWith(['aabb'], expect.any(Function));
    });
    expect(sessionStorage.getItem('ok-pending-firmware')).toBeNull();
    expect(device.triggerBootloader).not.toHaveBeenCalled();
  });

  it('shows a parse error for a non-firmware file', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.UNINITIALIZED,
      fwUpdateSupport: false,
      isBootloader: false,
    });
    renderWithProviders(<Firmware />);
    expect(screen.getByText(/click \[choose file\]/i)).toBeInTheDocument();
    const file = new File(['not firmware'], 'fw.txt', { type: 'text/plain' });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.click(screen.getByRole('button', { name: /load firmware to onlykey/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid hex/i)).toBeInTheDocument();
    });
    expect(sessionStorage.getItem('ok-pending-firmware')).toBeNull();
  });

  it('loads a chosen firmware file after bootloader kick', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    seedDeviceStore({
      device,
      deviceType: DeviceType.CLASSIC,
      fwUpdateSupport: true,
      isBootloader: false,
      version: 'v3.0.0',
    });
    renderWithProviders(<Firmware />);
    const file = new File(['-----BEGIN SIGNED FIRMWARE-----\naabb\n'], 'fw.txt', { type: 'text/plain' });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    await user.click(screen.getByRole('button', { name: /load firmware to onlykey/i }));
    await waitFor(() => {
      expect(device.triggerBootloader).toHaveBeenCalled();
    });
    expect(JSON.parse(sessionStorage.getItem('ok-pending-firmware') ?? 'null')).toEqual(['aabb']);
  });
});