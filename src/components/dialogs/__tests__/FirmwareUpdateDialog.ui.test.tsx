import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FirmwareUpdateDialog from '../FirmwareUpdateDialog';
import { renderWithProviders } from '../../../test/render';
import {
  resetFirmwareUpdateStoreForTests,
  useFirmwareUpdateStore,
} from '../../../store/useFirmwareUpdateStore';
import { useDeviceStore } from '../../../store/useDeviceStore';

describe('FirmwareUpdateDialog', () => {
  beforeEach(() => {
    resetFirmwareUpdateStoreForTests();
  });

  afterEach(() => {
    resetFirmwareUpdateStoreForTests();
  });

  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(<FirmwareUpdateDialog open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Download and Later when firmware is available', () => {
    useFirmwareUpdateStore.setState({
      phase: 'available',
      latestVersion: 'v3.0.4-prod',
      currentVersion: 'v2.1.2 STD',
    });
    renderWithProviders(<FirmwareUpdateDialog open />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(
      screen.getByText(/firmware v3\.0\.4-prod is available\. your version is v2\.1\.2 std/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^load/i })).not.toBeInTheDocument();
  });

  it('disables Later while downloading', () => {
    useFirmwareUpdateStore.setState({
      phase: 'downloading',
      latestVersion: 'v3.0.4-prod',
      downloadReceived: 0,
      downloadTotal: null,
    });
    renderWithProviders(<FirmwareUpdateDialog open />);
    expect(screen.getByText(/downloading firmware v3\.0\.4-prod/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /later/i })).toBeDisabled();
  });

  it('ready state offers Open Firmware tab and Later, not Load', async () => {
    const user = userEvent.setup();
    useFirmwareUpdateStore.setState({
      phase: 'ready',
      latestVersion: 'v3.0.4-prod',
      blocks: ['aa'],
      sha256: 'abc',
      promptVisible: true,
    });
    renderWithProviders(<FirmwareUpdateDialog open />);
    expect(screen.getByRole('button', { name: /open firmware tab/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^load/i })).not.toBeInTheDocument();
    expect(
      screen.getByText('Firmware v3.0.4-prod was downloaded and verified (SHA-256).'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /open firmware tab/i }));
    expect(useDeviceStore.getState().activeTab).toBe('firmware');
    expect(useFirmwareUpdateStore.getState().promptVisible).toBe(false);
    expect(useFirmwareUpdateStore.getState().blocks).toEqual(['aa']);
  });

  it('Later from ready hides the prompt and keeps RAM blocks', async () => {
    const user = userEvent.setup();
    useFirmwareUpdateStore.setState({
      phase: 'ready',
      latestVersion: 'v3.0.4-prod',
      blocks: ['aa'],
      promptVisible: true,
    });
    renderWithProviders(<FirmwareUpdateDialog open />);
    await user.click(screen.getByRole('button', { name: /later/i }));
    expect(useFirmwareUpdateStore.getState().promptVisible).toBe(false);
    expect(useFirmwareUpdateStore.getState().blocks).toEqual(['aa']);
    expect(useFirmwareUpdateStore.getState().phase).toBe('idle');
  });

  it('shows an error body and OK', () => {
    useFirmwareUpdateStore.setState({
      phase: 'error',
      error: 'The downloaded firmware failed integrity verification (SHA-256). It was not sent to OnlyKey.',
    });
    renderWithProviders(<FirmwareUpdateDialog open />);
    expect(screen.getByText(/failed integrity verification/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ok$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^load/i })).not.toBeInTheDocument();
  });

  it('shows up-to-date copy', () => {
    useFirmwareUpdateStore.setState({
      phase: 'up-to-date',
      currentVersion: 'v3.0.4-prodc',
    });
    renderWithProviders(<FirmwareUpdateDialog open />);
    expect(screen.getByText(/firmware v3\.0\.4-prodc is up to date/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^ok$/i })).toBeInTheDocument();
  });
});
