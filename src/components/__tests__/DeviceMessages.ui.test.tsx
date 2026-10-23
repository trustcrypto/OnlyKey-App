import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import DeviceMessages from '../DeviceMessages';
import { renderWithProviders } from '../../test/render';
import { seedDeviceStore } from '../../test/store';

describe('DeviceMessages', () => {
  it('shows Last messages label and five terminal lines', () => {
    seedDeviceStore({
      recentMessages: ['Latest OK', 'Older line'],
    });
    renderWithProviders(<DeviceMessages />);

    expect(screen.getByText('Last messages')).toBeInTheDocument();
    const lines = screen.getAllByRole('generic', { hidden: true });
    const terminalLines = lines.filter((el) => el.classList?.contains('device-messages-line'));
    expect(terminalLines).toHaveLength(5);
    expect(screen.getByText('Latest OK')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(3);
  });

  it('caps display at five messages from store (shows latest 5)', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => `msg${i}`);
    seedDeviceStore({ recentMessages: msgs });
    renderWithProviders(<DeviceMessages />);

    expect(screen.getByText('msg0')).toBeInTheDocument();
    expect(screen.getByText('msg4')).toBeInTheDocument();
    expect(screen.queryByText('msg5')).not.toBeInTheDocument();
  });

  it('shows nav button at bottom when older messages available (offset 0)', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => `msg${i}`);
    seedDeviceStore({ recentMessages: msgs });
    renderWithProviders(<DeviceMessages />);

    const olderBtn = screen.getByLabelText('Show older messages');
    expect(olderBtn).toBeInTheDocument();
    expect(olderBtn).toHaveClass('device-messages-nav--bottom');
    expect(screen.queryByLabelText('Show newer messages')).not.toBeInTheDocument();
  });

  it('shows older messages on scroll down (ArrowDown key)', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => `msg${i}`);
    seedDeviceStore({ recentMessages: msgs });
    renderWithProviders(<DeviceMessages />);

    const terminal = screen.getByText('msg0').closest('.device-messages-terminal');
    fireEvent.keyDown(terminal!, { key: 'ArrowDown' });

    expect(screen.queryByText('msg0')).not.toBeInTheDocument();
    expect(screen.getByText('msg1')).toBeInTheDocument();
    expect(screen.getByText('msg5')).toBeInTheDocument();
    expect(screen.queryByText('msg6')).not.toBeInTheDocument();
  });

  it('shows newer messages on scroll up (ArrowUp key)', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => `msg${i}`);
    seedDeviceStore({ recentMessages: msgs });
    renderWithProviders(<DeviceMessages />);

    const terminal = screen.getByText('msg0').closest('.device-messages-terminal');

    fireEvent.keyDown(terminal!, { key: 'ArrowDown' });
    fireEvent.keyDown(terminal!, { key: 'ArrowUp' });

    expect(screen.getByText('msg0')).toBeInTheDocument();
    expect(screen.queryByText('msg5')).not.toBeInTheDocument();
  });

  it('shows older messages on nav down button click', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => `msg${i}`);
    seedDeviceStore({ recentMessages: msgs });
    renderWithProviders(<DeviceMessages />);

    const downBtn = screen.getByLabelText('Show older messages');
    fireEvent.click(downBtn);

    expect(screen.queryByText('msg0')).not.toBeInTheDocument();
    expect(screen.getByText('msg1')).toBeInTheDocument();
    expect(screen.getByText('msg5')).toBeInTheDocument();
  });

  it('shows newer messages on nav up button click', () => {
    const msgs = Array.from({ length: 50 }, (_, i) => `msg${i}`);
    seedDeviceStore({ recentMessages: msgs });
    renderWithProviders(<DeviceMessages />);

    const downBtn = screen.getByLabelText('Show older messages');

    fireEvent.click(downBtn);
    expect(screen.queryByText('msg0')).not.toBeInTheDocument();

    const upBtn = screen.getByLabelText('Show newer messages');
    fireEvent.click(upBtn);

    expect(screen.getByText('msg0')).toBeInTheDocument();
    expect(screen.queryByText('msg5')).not.toBeInTheDocument();
  });
});
