import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeviceDialogs from '../DeviceDialogs';
import { DeviceType } from '../../api/device/types';
import { renderWithProviders } from '../../test/render';
import { getStoreState, seedDeviceStore } from '../../test/store';

describe('DeviceDialogs', () => {
  it('shows the Linux udev dialog and dismisses it', async () => {
    const user = userEvent.setup();
    seedDeviceStore({ showUdevDialog: true });
    renderWithProviders(<DeviceDialogs />);
    expect(screen.getByRole('heading', { name: /linux usb permissions/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(getStoreState().showUdevDialog).toBe(false);
  });

  it('shows a DUO pin error toast while locked', () => {
    seedDeviceStore({
      isLocked: true,
      deviceType: DeviceType.DUO,
      pinError: 'Error incorrect PIN',
    });
    renderWithProviders(<DeviceDialogs />);
    expect(screen.getByText(/incorrect pin/i)).toBeInTheDocument();
  });

  it('renders nothing by default', () => {
    seedDeviceStore({ showUdevDialog: false, pinError: null, isLocked: true, deviceType: DeviceType.CLASSIC });
    const { container } = renderWithProviders(<DeviceDialogs />);
    expect(container).toBeEmptyDOMElement();
  });
});
