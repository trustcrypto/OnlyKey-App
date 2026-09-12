import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Firmware from '../Firmware';
import WorkingDialog from '../dialogs/WorkingDialog';
import { DeviceType } from '../../api/device/types';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, seedDeviceStore } from '../../test/store';
import * as firmwareDownload from '../../desktop/firmwareDownload';
import * as firmwareUpdateStore from '../../store/useFirmwareUpdateStore';
import {
  resetFirmwareUpdateStoreForTests,
  useFirmwareUpdateStore,
} from '../../store/useFirmwareUpdateStore';

describe('Firmware page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    resetFirmwareUpdateStoreForTests();
  });

  it('shows only the config mode error when bootloader trigger fails', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    device.triggerBootloader = vi.fn().mockRejectedValue(new Error('Error: Not in Config Mode'));

    vi.spyOn(firmwareDownload, 'downloadLatestFirmware').mockResolvedValue({
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

  it('enables load in bootloader even when the previous firmware lacked in-app updates', () => {
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.BOOTLOADER,
      fwUpdateSupport: false,
      isBootloader: true,
      version: '',
    });
    renderWithProviders(<Firmware />);
    expect(screen.getByRole('button', { name: /download latest firmware/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /load firmware to onlykey/i })).toBeDisabled();
    expect(document.querySelector('input[type="file"]')).not.toBeDisabled();
    expect(screen.queryByText(/does not support this feature/i)).not.toBeInTheDocument();
    expect(screen.getByText(/click \[choose file\]/i)).toBeInTheDocument();
  });

  it('loads firmware blocks directly while in bootloader mode', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    vi.spyOn(firmwareDownload, 'downloadLatestFirmware').mockResolvedValue({
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

  it('does not send firmware until Load is clicked and shows Working in bootloader', async () => {
    const user = userEvent.setup();
    let finishLoad!: () => void;
    const loadFirmwareBlocks = vi.fn(
      (_blocks: string[], onProgress?: (pct: number) => void) =>
        new Promise<void>((resolve) => {
          onProgress?.(25);
          finishLoad = resolve;
        }),
    );
    const device = createMockDeviceClient({ loadFirmwareBlocks });
    seedDeviceStore({
      device,
      deviceType: DeviceType.BOOTLOADER,
      fwUpdateSupport: false,
      isBootloader: true,
      version: 'v1',
    });
    renderWithProviders(
      <>
        <WorkingDialog />
        <Firmware />
      </>,
    );
    const loadBtn = screen.getByRole('button', { name: /load firmware to onlykey/i });
    expect(loadBtn).toBeDisabled();
    const file = new File(['-----BEGIN SIGNED FIRMWARE-----\naabb\n'], 'fw.txt', { type: 'text/plain' });
    await user.upload(document.querySelector('input[type="file"]') as HTMLInputElement, file);
    expect(loadFirmwareBlocks).not.toHaveBeenCalled();
    expect(loadBtn).toBeEnabled();
    await user.click(loadBtn);
    await waitFor(() => expect(loadFirmwareBlocks).toHaveBeenCalled());
    expect(await screen.findByTestId('working-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('working-message')).toHaveTextContent(/loading firmware/i);
    expect(screen.getByTestId('working-progress')).toHaveAttribute('aria-valuenow', '25');
    expect(screen.getByText('25%')).toBeInTheDocument();
    finishLoad();
    await waitFor(() => expect(screen.queryByTestId('working-dialog')).not.toBeInTheDocument());
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

  it('Check now calls the store even when auto-update firmware is off', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    const checkNow = vi.spyOn(firmwareUpdateStore, 'checkNow').mockResolvedValue(undefined);
    const downloadLatest = vi.spyOn(firmwareDownload, 'downloadLatestFirmware');
    localStorage.setItem('autoUpdateFW', 'false');
    seedDeviceStore({
      device,
      deviceType: DeviceType.CLASSIC,
      version: 'v2.1.1 STD',
      fwUpdateSupport: true,
      isBootloader: false,
      isLocked: false,
      isWorking: false,
      isConnected: true,
    });
    useFirmwareUpdateStore.setState({ autoCheckFW: false });
    renderWithProviders(<Firmware />);

    await user.click(screen.getByRole('button', { name: /^check now$/i }));
    expect(checkNow).toHaveBeenCalledTimes(1);
    expect(downloadLatest).not.toHaveBeenCalled();
    expect(device.triggerBootloader).not.toHaveBeenCalled();
    expect(device.loadFirmwareBlocks).not.toHaveBeenCalled();
  });

  it('shows the last firmware-update error from the store', () => {
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      fwUpdateSupport: true,
      isBootloader: false,
      version: 'v2.1.1 STD',
    });
    useFirmwareUpdateStore.setState({
      phase: 'error',
      error: 'Could not reach the firmware server (HTTP 502).',
    });
    renderWithProviders(<Firmware />);
    expect(screen.getByText(/could not reach the firmware server \(http 502\)/i)).toBeInTheDocument();
  });

  it('disables Check now in bootloader while Download Latest stays a one-shot apply', async () => {
    const user = userEvent.setup();
    const device = createMockDeviceClient();
    vi.spyOn(firmwareDownload, 'downloadLatestFirmware').mockResolvedValue({
      version: 'v3.0.4',
      blocks: ['aa', 'bb'],
      downloadUrl: 'https://example.com/fw.txt',
      sha256: 'abc',
    });
    seedDeviceStore({
      device,
      deviceType: DeviceType.BOOTLOADER,
      fwUpdateSupport: false,
      isBootloader: true,
      isLocked: false,
      version: 'v1',
    });
    renderWithProviders(<Firmware />);
    expect(screen.getByTestId('firmware-tab-check-now')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /download latest firmware/i }));
    await waitFor(() => {
      expect(device.loadFirmwareBlocks).toHaveBeenCalledWith(['aa', 'bb'], expect.any(Function));
    });
    expect(device.triggerBootloader).not.toHaveBeenCalled();
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