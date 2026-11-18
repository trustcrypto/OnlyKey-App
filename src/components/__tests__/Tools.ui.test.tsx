import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import Tools from '../Tools';
import { renderWithProviders } from '../../test/render';

describe('Tools page', () => {
  it('renders WebCrypt and Agent sections with external links', () => {
    renderWithProviders(<Tools />);

    expect(screen.getByRole('heading', { name: /^tools$/i })).toBeInTheDocument();
    expect(screen.getByText(/onlykey webcrypt/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /with onlykey agent/i })).toBeInTheDocument();

    const encrypt = screen.getByRole('link', { name: /encrypt messages/i });
    expect(encrypt).toHaveAttribute('href', 'https://apps.crp.to/app/encrypt');
    expect(encrypt).toHaveAttribute('target', '_blank');

    const vault = screen.getByRole('link', { name: /password vault/i });
    expect(vault).toHaveAttribute('href', 'https://apps.onlykey.io/app/vault');
    expect(vault).toHaveAttribute('target', '_blank');

    const agent = screen.getByRole('link', { name: /^.*onlykey agent$/i });
    expect(agent).toHaveAttribute('href', 'https://docs.crp.to/onlykey-agent.html');
    expect(screen.queryByRole('link', { name: /gpg agent|ssh agent/i })).not.toBeInTheDocument();
  });

  it('includes the app-update settings card', () => {
    renderWithProviders(<Tools />);
    expect(screen.getByTestId('app-update-settings')).toBeInTheDocument();
    expect(screen.getByTestId('check-now')).toBeInTheDocument();
  });

  it('does not host firmware update controls', () => {
    renderWithProviders(<Tools />);
    expect(screen.queryByTestId('auto-update-fw-checkbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/automatically check for firmware updates/i)).not.toBeInTheDocument();
  });
});