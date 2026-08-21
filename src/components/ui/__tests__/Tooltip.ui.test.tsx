import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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
