import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import WorkingDialog from '../dialogs/WorkingDialog';
import { renderWithProviders } from '../../test/render';
import { seedDeviceStore } from '../../test/store';

describe('WorkingDialog', () => {
  it('is hidden when idle', () => {
    seedDeviceStore({ isWorking: false, workingProgress: null });
    const { container } = renderWithProviders(<WorkingDialog />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows animated SVG spinner with message and progress', () => {
    seedDeviceStore({
      isWorking: true,
      workingMessage: 'Sending backup to OnlyKey… 40%',
      workingProgress: 40,
    });
    renderWithProviders(<WorkingDialog />);

    expect(screen.getByTestId('working-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('working-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('working-message')).toHaveTextContent(/sending backup/i);
    expect(screen.getByTestId('working-progress')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText(/do not remove your onlykey/i)).toBeInTheDocument();
    // No legacy Pacman GIF
    expect(document.querySelector('img[src*="Pacman"]')).toBeNull();
  });
});
