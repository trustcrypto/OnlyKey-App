import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SlotGrid, { EMPTY_SLOT_LABEL } from '../SlotGrid';
import { DeviceType } from '../../api/device/types';
import { renderWithProviders } from '../../test/render';
import { seedDeviceStore, getStoreState } from '../../test/store';

describe('SlotGrid', () => {
  it('renders classic slot pills with labels', () => {
    seedDeviceStore({
      deviceType: DeviceType.CLASSIC,
      labels: { 1: 'Gmail', 2: 'empty' },
    });
    renderWithProviders(<SlotGrid />);

    expect(screen.getByRole('button', { name: /1a gmail/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1b <empty>/i })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${EMPTY_SLOT_LABEL} have no label set`, 'i'))).toBeInTheDocument();
    expect(screen.getByText(/only receives slot labels/i)).toBeInTheDocument();
    expect(screen.getByAltText('OnlyKey device')).toBeInTheDocument();
  });

  it('renders DUO device image and profile pills', () => {
    seedDeviceStore({
      deviceType: DeviceType.DUO,
      duoProfile: 'green',
      labels: { 1: 'Work', 2: 'Personal' },
    });
    renderWithProviders(<SlotGrid />);

    expect(screen.getByAltText('OnlyKey Duo device')).toBeInTheDocument();
    expect(screen.getByTitle(/green profile/i)).toBeInTheDocument();
  });

  it('opens slot editor when a pill is clicked', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      deviceType: DeviceType.CLASSIC,
      labels: { 1: 'Gmail' },
    });
    renderWithProviders(<SlotGrid />);

    await user.click(screen.getByRole('button', { name: /1a gmail/i }));
    expect(getStoreState().selectedSlotId).toBe(1);
  });
});