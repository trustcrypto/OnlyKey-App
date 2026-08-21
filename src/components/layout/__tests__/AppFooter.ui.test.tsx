import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import AppFooter from '../AppFooter';
import { DeviceType } from '../../../api/device/types';
import { renderWithProviders } from '../../../test/render';
import { seedDeviceStore } from '../../../test/store';

describe('AppFooter', () => {
  it('renders app version and recent messages when connected', () => {
    seedDeviceStore({
      isConnected: true,
      deviceType: DeviceType.CLASSIC,
      version: 'v2.1.0-prod',
      usbProductId: 0x0486,
      deviceTypeSource: 'status',
      maxLabelSlot: 12,
      lastStatusText: 'UNLOCKEDv2.1.0-prod',
      recentMessages: ['UNLOCKEDv2.1.0-prod', 'older-one', 'older-two'],
    });
    renderWithProviders(<AppFooter />);
    expect(screen.getByText(/App v5\.7\.0/)).toBeInTheDocument();
    expect(screen.getByText(/OnlyKey v2\.1\.0-prod/)).toBeInTheDocument();
    expect(screen.getAllByText(/UNLOCKEDv2\.1\.0-prod/).length).toBeGreaterThan(0);
    expect(screen.getByText(/PID 0x486/i)).toBeInTheDocument();
  });

  it('labels DUO and uninitialized devices', () => {
    seedDeviceStore({
      isConnected: true,
      deviceType: DeviceType.DUO,
      version: 'v3.0.0-prod',
      recentMessages: [],
    });
    const { unmount } = renderWithProviders(<AppFooter />);
    expect(screen.getByText(/OnlyKey DUO v3\.0\.0-prod/)).toBeInTheDocument();
    unmount();

    seedDeviceStore({
      isConnected: true,
      deviceType: DeviceType.UNINITIALIZED,
      version: '',
      recentMessages: [],
    });
    renderWithProviders(<AppFooter />);
    expect(screen.getByText(/uninitialized/i)).toBeInTheDocument();
  });
});
