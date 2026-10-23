import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
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

  it('does not leak delay or password flags onto the next selected slot', async () => {
    const user = userEvent.setup();
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      devicePinSet: true,
      selectedSlotId: 1,
      labels: { 1: 'Gmail', 2: 'GitHub' },
    });
    renderWithProviders(<SlotEditor />);

    let editor = screen.getByTestId('slot-editor');
    await user.click(within(editor).getByRole('tab', { name: /full configuration/i }));
    await user.click(within(editor).getByRole('checkbox', { name: /delay after url/i }));
    await user.click(within(editor).getByRole('checkbox', { name: /password \(up to 56 chars\)/i }));
    const delayInput = within(editor).getByRole('textbox', { name: /delay after url/i });
    await user.clear(delayInput);
    await user.type(delayInput, '5');

    getStoreState().setSelectedSlot(2);
    editor = await screen.findByTestId('slot-editor');
    expect(within(editor).getByRole('heading', { name: /onlykey slot 2 configuration/i })).toBeInTheDocument();
    expect(within(editor).getByDisplayValue('GitHub')).toBeInTheDocument();
    expect(within(editor).getByRole('checkbox', { name: /delay after url/i })).not.toBeChecked();
    expect(within(editor).getByRole('checkbox', { name: /password \(up to 56 chars\)/i })).not.toBeChecked();
    expect(within(editor).getByRole('textbox', { name: /delay after url/i })).toHaveValue('0');

    await user.click(within(editor).getByRole('button', { name: /set slot/i }));
    expect(slotConfigService.saveSlotConfig).toHaveBeenCalledWith(
      expect.anything(),
      2,
      expect.objectContaining({ delay1: false, password: false }),
      expect.objectContaining({ delay1: '0', password: '', label: 'GitHub' }),
    );
  });

  it('treats an empty device label as a blank form label', async () => {
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      devicePinSet: true,
      selectedSlotId: 4,
      labels: { 4: 'empty' },
    });
    renderWithProviders(<SlotEditor />);
    const editor = screen.getByTestId('slot-editor');
    expect(within(editor).getByPlaceholderText(/e.g. github/i)).toHaveValue('');
  });

  it('shows a save error and keeps the editor open', async () => {
    const user = userEvent.setup();
    vi.mocked(slotConfigService.saveSlotConfig).mockRejectedValueOnce(new Error('Password fields do not match.'));
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      devicePinSet: true,
      selectedSlotId: 1,
      labels: { 1: 'Gmail' },
    });
    renderWithProviders(<SlotEditor />);
    const editor = screen.getByTestId('slot-editor');
    await user.click(within(editor).getByRole('button', { name: /set slot/i }));
    expect(await screen.findByText(/password fields do not match/i)).toBeInTheDocument();
    expect(getStoreState().selectedSlotId).toBe(1);
  });

  it('sets type speed, next-key radios, generated password, and closes from the header', async () => {
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
    await user.click(within(editor).getByRole('checkbox', { name: /keyboard type speed/i }));
    fireEvent.change(within(editor).getByRole('spinbutton', { name: /keyboard type speed/i }), {
      target: { value: '7' },
    });
    await user.click(within(editor).getByRole('checkbox', { name: /after username/i }));
    await user.click(within(editor).getAllByRole('radio', { name: /^tab$/i })[0]);
    await user.click(within(editor).getByRole('button', { name: /^gen$/i }));
    await user.click(screen.getByRole('button', { name: /^generate$/i }));
    await user.click(screen.getByRole('button', { name: /use password/i }));
    await user.click(within(editor).getByRole('button', { name: /close/i }));
    expect(getStoreState().selectedSlotId).toBeNull();
  });

  it('cancels wipe and surfaces a wipe error', async () => {
    const user = userEvent.setup();
    vi.mocked(slotConfigService.wipeSlotData).mockRejectedValueOnce(new Error('wipe blocked'));
    seedDeviceStore({
      device: createMockDeviceClient(),
      deviceType: DeviceType.CLASSIC,
      selectedSlotId: 3,
      labels: { 3: 'Bank' },
    });
    renderWithProviders(<SlotEditor />);
    const editor = screen.getByTestId('slot-editor');
    await user.click(within(editor).getByRole('button', { name: /wipe all slot data/i }));
    const wipeDialog = screen.getByRole('heading', { name: /wipe slot/i }).closest('div') as HTMLElement;
    await user.click(within(wipeDialog).getByRole('button', { name: /^cancel$/i }));
    expect(slotConfigService.wipeSlotData).not.toHaveBeenCalled();

    await user.click(within(editor).getByRole('button', { name: /wipe all slot data/i }));
    await user.click(screen.getByRole('button', { name: /^wipe slot$/i }));
    expect(await screen.findByText(/wipe blocked/i)).toBeInTheDocument();
    expect(getStoreState().selectedSlotId).toBe(3);
  });

  it('edits MFA TOTP and Yubikey OTP fields', async () => {
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
    await user.click(within(editor).getByRole('tab', { name: /multi-factor/i }));
    await user.type(within(editor).getByPlaceholderText(/totp secret/i), 'JBSWY3DPEHPK3PXP');
    await user.type(within(editor).getByPlaceholderText(/public identity/i), 'cccccc');
    await user.type(within(editor).getByPlaceholderText(/private identity/i), '112233');
    await user.type(within(editor).getByPlaceholderText(/secret key/i), 'aabbcc');
    await user.click(within(editor).getByRole('button', { name: /set slot/i }));
    expect(slotConfigService.saveSlotConfig).toHaveBeenCalled();
  });
});