import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import Tools from '../Tools';
import { renderWithProviders } from '../../test/render';

describe('Tools page', () => {
  it('renders WebCrypt and Agent sections with external links', () => {
    renderWithProviders(<Tools />);

    expect(screen.getByRole('heading', { name: /^tools$/i })).toBeInTheDocument();
    expect(screen.getByText(/onlykey webcrypt/i)).toBeInTheDocument();
    expect(screen.getByText(/onlykey agent/i)).toBeInTheDocument();

    const encrypt = screen.getByRole('link', { name: /encrypt messages/i });
    expect(encrypt).toHaveAttribute('href', 'https://apps.crp.to/app/encrypt');
    expect(encrypt).toHaveAttribute('target', '_blank');

    const gpg = screen.getByRole('link', { name: /onlykey gpg agent/i });
    expect(gpg).toHaveAttribute('href', 'https://docs.crp.to/gpgagentquickstart.html');
  });
});