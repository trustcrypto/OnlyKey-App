import { describe, it, expect } from 'vitest';
import { screen, within } from '@testing-library/react';
import DeviceMessages from '../DeviceMessages';
import { renderWithProviders } from '../../test/render';
import { seedDeviceStore } from '../../test/store';

describe('DeviceMessages', () => {
  it('shows Last 5 messages label and five terminal lines', () => {
    seedDeviceStore({
      recentMessages: ['Latest OK', 'Older line'],
    });
    renderWithProviders(<DeviceMessages />);

    expect(screen.getByText('Last 5 messages')).toBeInTheDocument();
    const terminal = screen.getByTitle(/latest ok/i);
    expect(terminal.querySelectorAll('.device-messages-line')).toHaveLength(5);
    expect(screen.getByText('Latest OK')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('caps display at five messages from store', () => {
    seedDeviceStore({
      recentMessages: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
    });
    renderWithProviders(<DeviceMessages />);

    expect(screen.getByText('m1')).toBeInTheDocument();
    expect(screen.getByText('m5')).toBeInTheDocument();
    expect(screen.queryByText('m6')).not.toBeInTheDocument();
  });
});