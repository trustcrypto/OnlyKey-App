import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginItemAccessHost, { resetLoginItemAccessPrompt } from '../LoginItemAccessHost';
import { renderWithProviders } from '../../test/render';

describe('LoginItemAccessHost', () => {
  afterEach(() => {
    resetLoginItemAccessPrompt();
    delete window.onlykeyAskLoginItemAccess;
    delete window.onlykeyShowLoginItemLeftover;
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

  it('opens after a remount when the shell already asked', async () => {
    const user = userEvent.setup();
    const first = renderWithProviders(<LoginItemAccessHost />);
    const ask = window.onlykeyAskLoginItemAccess;
    expect(ask).toBeTypeOf('function');
    first.unmount();

    const pending = ask!();
    renderWithProviders(<LoginItemAccessHost />);
    expect(await screen.findByRole('heading', { name: 'Allow System Events' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Not now' }));
    await expect(pending).resolves.toBe('later');
  });

  it('tells the user how to remove an older login item that is still there (#262)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginItemAccessHost />);
    const show = window.onlykeyShowLoginItemLeftover;
    expect(show).toBeTypeOf('function');

    const remaining = show!('remaining');
    expect(await screen.findByRole('heading', { name: 'Remove the older login item' })).toBeInTheDocument();
    expect(screen.getByText(/still set to open at login/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Login Items' }));
    await expect(remaining).resolves.toBe('open');
    expect(screen.queryByRole('heading', { name: 'Remove the older login item' })).not.toBeInTheDocument();

    const denied = show!('denied');
    expect(await screen.findByText(/could not check for a login item/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await expect(denied).resolves.toBe('close');
  });

  it('waits for the System Events note to close before showing the leftover note', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginItemAccessHost />);
    const access = window.onlykeyAskLoginItemAccess!();
    const leftover = window.onlykeyShowLoginItemLeftover!('remaining');
    expect(await screen.findByRole('heading', { name: 'Allow System Events' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Remove the older login item' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await expect(access).resolves.toBe(true);
    expect(await screen.findByRole('heading', { name: 'Remove the older login item' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await expect(leftover).resolves.toBe('close');
  });
});
