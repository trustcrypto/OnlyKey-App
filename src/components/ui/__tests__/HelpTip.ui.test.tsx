import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { HelpTip } from '../HelpTip';
import { renderWithProviders } from '../../../test/render';

describe('HelpTip', () => {
  it('renders a help link when href is provided', () => {
    renderWithProviders(<HelpTip tooltip="More" href="https://docs.crp.to" />);
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', 'https://docs.crp.to');
  });

  it('renders a static help icon without href', () => {
    renderWithProviders(<HelpTip tooltip="More" />);
    expect(screen.getByLabelText('Help')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
