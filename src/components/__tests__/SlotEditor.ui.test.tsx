import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SlotEditor from '../SlotEditor';
import { DeviceType } from '../../api/device/types';
import { renderWithProviders } from '../../test/render';
import { createMockDeviceClient, getStoreState, seedDeviceStore } from '../../test/store';
import * as slotConfigService from '../../services/slot/slotConfigService';

vi.mock('../../services/slot/slotConfigService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/slot/slotConfigService')>();
  return {
    ...actual,
    saveSlotConfig: vi.fn().mockResolvedValue(undefined),
    wipeSlotData: vi.fn().mockResolvedValue(undefined),
  };
});

describe('SlotEditor', () => {
  beforeEach(() => {
    vi.mocked(slotConfigService.saveSlotConfig).mockClear();
    vi.mocked(slotConfigService.wipeSlotData).mockClear();
  });

  it('is hidden when no slot is selected', () => {
    seedDeviceStore({ device: createMockDeviceClient(), selectedSlotId: null });
    renderWithProviders(<SlotEditor />);
    expect(screen.queryByTestId('slot-editor')).not.toBeInTheDocument();
  });

  it('opens for selected slot and closes on cancel', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      devicePinSet: true,
      selectedSlotId: 1,
      labels: { 1: 'Gmail' },
    });
    renderWithProviders(<SlotEditor />);

    const editor = screen.getByTestId('slot-editor');
    expect(within(editor).getByRole('heading', { name: /onlykey slot 1 configuration/i })).toBeInTheDocument();
    expect(within(editor).getByDisplayValue('Gmail')).toBeInTheDocument();

    await user.click(within(editor).getByRole('button', { name: /cancel/i }));
    expect(getStoreState().selectedSlotId).toBeNull();
  });

  it('switches config mode tabs without filled CTA styling', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      devicePinSet: true,
      selectedSlotId: 2,
      labels: { 2: 'GitHub' },
    });
    renderWithProviders(<SlotEditor />);

    const editor = screen.getByTestId('slot-editor');
    const mfaTab = within(editor).getByRole('tab', { name: /multi-factor/i });
    expect(mfaTab).not.toHaveClass('bg-ok-blue');

    await user.click(mfaTab);
    expect(within(editor).getByText(/two-factor authentication/i)).toBeInTheDocument();
  });

  it('saves slot config and clears selection', async () => {
    const user = userEvent.setup();
    const refreshLabels = vi.fn().mockResolvedValue(undefined);
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      devicePinSet: true,
      selectedSlotId: 1,
      labels: { 1: 'Gmail' },
      refreshLabels,
    });
    renderWithProviders(<SlotEditor />);

    const editor = screen.getByTestId('slot-editor');
    await user.click(within(editor).getByRole('button', { name: /set slot/i }));

    expect(slotConfigService.saveSlotConfig).toHaveBeenCalled();
    expect(refreshLabels).toHaveBeenCalled();
    expect(getStoreState().selectedSlotId).toBeNull();
  });

  it('shows DUO no-PIN warning and limited tabs', () => {
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.DUO,
      devicePinSet: false,
      selectedSlotId: 1,
      labels: { 1: 'empty' },
    });
    renderWithProviders(<SlotEditor />);

    const editor = screen.getByTestId('slot-editor');
    expect(within(editor).getByText(/duo without pin/i)).toBeInTheDocument();
    expect(within(editor).getByRole('tab', { name: /static password/i })).toBeInTheDocument();
    expect(within(editor).queryByRole('tab', { name: /full configuration/i })).not.toBeInTheDocument();
  });

  it('confirms before wiping slot data', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      selectedSlotId: 3,
      labels: { 3: 'Bank' },
    });
    renderWithProviders(<SlotEditor />);

    const editor = screen.getByTestId('slot-editor');
    await user.click(within(editor).getByRole('button', { name: /wipe all slot data/i }));
    expect(screen.getByRole('heading', { name: /wipe slot/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^wipe slot$/i }));
    expect(slotConfigService.wipeSlotData).toHaveBeenCalled();
    expect(getStoreState().selectedSlotId).toBeNull();
  });
});