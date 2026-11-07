import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginItemAccessHost from '../LoginItemAccessHost';
import { renderWithProviders } from '../../test/render';

describe('LoginItemAccessHost', () => {
  afterEach(() => {
    delete window.onlykeyAskLoginItemAccess;
  });

  it('stays closed until the desktop shell asks', () => {
    renderWithProviders(<LoginItemAccessHost />);
    expect(screen.queryByRole('heading', { name: 'Allow System Events' })).not.toBeInTheDocument();
    expect(typeof window.onlykeyAskLoginItemAccess).toBe('function');
  });

  it('resolves Continue and Not now for the desktop shell', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginItemAccessHost />);
    const ask = window.onlykeyAskLoginItemAccess;
    expect(ask).toBeTypeOf('function');

    const first = ask!();
    expect(await screen.findByRole('heading', { name: 'Allow System Events' })).toBeInTheDocument();
    expect(screen.getByText(/remove login items left by older versions/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await expect(first).resolves.toBe(true);
    expect(screen.queryByRole('heading', { name: 'Allow System Events' })).not.toBeInTheDocument();

    const second = ask!();
    await screen.findByRole('button', { name: 'Not now' });
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    await expect(second).resolves.toBe('later');
  });
});
