import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PseudoTabBar } from '../PseudoTabs';
import { renderWithProviders } from '../../../test/render';

describe('PseudoTabBar', () => {
  it('uses underline tabs, not filled CTA styling', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <PseudoTabBar
        tabs={[
          { id: 'basic', label: 'Basic Login' },
          { id: 'mfa', label: 'Multi-factor' },
        ]}
        active="basic"
        onChange={onChange}
      />,
    );

    const basic = screen.getByRole('tab', { name: 'Basic Login' });
    const mfa = screen.getByRole('tab', { name: 'Multi-factor' });

    expect(basic).toHaveClass('pseudo-tab--active');
    expect(basic).not.toHaveClass('bg-ok-blue');
    expect(mfa).not.toHaveClass('pseudo-tab--active');

    await user.click(mfa);
    expect(onChange).toHaveBeenCalledWith('mfa');
  });
});