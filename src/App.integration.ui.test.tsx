import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { renderWithProviders } from './test/render';
import { waitForConnected } from './test/helpers';
import { getStoreState } from './test/store';

describe('App mock-device integration', () => {
  it('connects through MockTransport without stubbing initialize', async () => {
    renderWithProviders(<App />);
    await waitForConnected(12_000);

    expect(screen.getByTestId('sidebar-status')).toHaveTextContent('Connected');
    expect(screen.queryByTestId('disconnected-overlay')).not.toBeInTheDocument();
    expect(getStoreState().deviceType).toBeTruthy();
  });

  it('applies slots-page layout class on the Slots tab', async () => {
    renderWithProviders(<App />);
    await waitForConnected(12_000);

    const user = userEvent.setup();
    await user.click(screen.getByTestId('nav-slots'));

    expect(document.getElementById('app-main')).toHaveClass('slots-page');
  });
});