import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { HelpTip } from '../HelpTip';
import { renderWithProviders } from '../../../test/render';

describe('HelpTip', () => {
  it('renders a help link when href is provided', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const stop = vi.fn();
    renderWithProviders(<HelpTip tooltip="More" href="https://docs.crp.to" />);
    const link = screen.getByRole('link', { name: 'Help' });
    expect(link).toHaveAttribute('href', 'https://docs.crp.to');
    link.addEventListener('click', stop);
    await user.click(link);
    expect(stop).toHaveBeenCalled();
  });

  it('renders a static help icon without href', () => {
    renderWithProviders(<HelpTip tooltip="More" />);
    expect(screen.getByLabelText('Help')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
