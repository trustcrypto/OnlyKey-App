import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import AppUpdateHost from '../AppUpdateHost';
import { renderWithProviders } from '../../test/render';
import { seedDeviceStore } from '../../test/store';
import { resetAppUpdateStoreForTests, useAppUpdateStore } from '../../store/useAppUpdateStore';

vi.mock('../../store/useAppUpdateStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/useAppUpdateStore')>();
  return {
    ...actual,
    startAutoCheck: vi.fn(async () => undefined),
    bindAutoUpdatePrefListeners: () => () => undefined,
    abortAppUpdateFetches: vi.fn(),
  };
});

describe('AppUpdateHost', () => {
  beforeEach(() => {
    resetAppUpdateStoreForTests();
    seedDeviceStore({ isConnected: false, isLocked: true, isWorking: false });
  });

  afterEach(() => {
    resetAppUpdateStoreForTests();
  });

  it('shows the dialog when an update is available and the PIN is not up', () => {
    useAppUpdateStore.setState({
      phase: 'available',
      promptVisible: true,
      latestVersion: '5.7.1',
      currentVersion: '5.7.0',
    });
    renderWithProviders(<AppUpdateHost />);
    expect(screen.getByTestId('app-update-dialog')).toBeInTheDocument();
  });

  it('hides the dialog while the lock-screen PIN is showing', () => {
    seedDeviceStore({ isConnected: true, isLocked: true, isWorking: false });
    useAppUpdateStore.setState({
      phase: 'available',
      promptVisible: true,
      latestVersion: '5.7.1',
      currentVersion: '5.7.0',
    });
    renderWithProviders(<AppUpdateHost />);
    expect(screen.queryByTestId('app-update-dialog')).not.toBeInTheDocument();
  });

  it('hides the dialog while a device job is running', () => {
    seedDeviceStore({ isConnected: true, isLocked: false, isWorking: true });
    useAppUpdateStore.setState({
      phase: 'available',
      promptVisible: true,
      latestVersion: '5.7.1',
      currentVersion: '5.7.0',
    });
    renderWithProviders(<AppUpdateHost />);
    expect(screen.queryByTestId('app-update-dialog')).not.toBeInTheDocument();
  });
});
