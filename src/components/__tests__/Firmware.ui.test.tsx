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
});