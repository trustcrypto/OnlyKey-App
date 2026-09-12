import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppUpdateDialog from '../AppUpdateDialog';
import { renderWithProviders } from '../../../test/render';
import { useAppUpdateStore } from '../../../store/useAppUpdateStore';

describe('AppUpdateDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(<AppUpdateDialog open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Download and Later when an update is available', () => {
    useAppUpdateStore.setState({
      phase: 'available',
      latestVersion: '5.7.1',
      currentVersion: '5.7.0',
    });
    renderWithProviders(<AppUpdateDialog open />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/version 5\.7\.1 is available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /later/i })).toBeInTheDocument();
  });

  it('disables Later while downloading and shows percent', () => {
    useAppUpdateStore.setState({
      phase: 'downloading',
      latestVersion: '5.7.1',
      downloadReceived: 50,
      downloadTotal: 100,
    });
    renderWithProviders(<AppUpdateDialog open />);
    expect(screen.getByText(/downloading 5\.7\.1/i)).toHaveTextContent('50%');
    expect(screen.getByRole('button', { name: /later/i })).toBeDisabled();
  });

  it('ready state offers Install now, Show in folder, and Later', async () => {
    const user = userEvent.setup();
    useAppUpdateStore.setState({
      phase: 'ready',
      latestVersion: '5.7.1',
      destPath: '/tmp/ok.exe',
      promptVisible: true,
    });
    renderWithProviders(<AppUpdateDialog open />);
    expect(screen.getByRole('button', { name: /install now/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show in folder/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /later/i }));
    expect(useAppUpdateStore.getState().promptVisible).toBe(false);
  });
});
