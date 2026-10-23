import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from '../Tooltip';
import { renderWithProviders } from '../../../test/render';

describe('Tooltip', () => {
  it('shows on hover and hides on leave', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Tooltip text="Helpful hint">
        <button type="button">Tip</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.hover(screen.getByRole('button', { name: 'Tip' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Helpful hint');
    await user.unhover(screen.getByRole('button', { name: 'Tip' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('hides on blur and flips above when the trigger is near the bottom', async () => {
    const main = document.createElement('div');
    main.id = 'app-main';
    Object.defineProperty(main, 'getBoundingClientRect', {
      value: () => ({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0, toJSON: () => ({}) }),
    });
    document.body.appendChild(main);
    renderWithProviders(
      <Tooltip text="Flip">
        <button type="button">Tip</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button', { name: 'Tip' }).parentElement as HTMLElement;
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      left: 10, top: 160, right: 50, bottom: 190, width: 40, height: 30, x: 10, y: 160, toJSON: () => ({}),
    } as DOMRect);
    fireEvent.focus(trigger);
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    main.remove();
  });

  it('shows on focus', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Tooltip text="Focus hint">
        <button type="button">Tip</button>
      </Tooltip>,
    );
    await user.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Focus hint');
  });
});
