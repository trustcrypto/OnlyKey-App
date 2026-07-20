import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ThemeToggle from '../ThemeToggle';
import { renderWithProviders } from '../../test/render';

describe('ThemeToggle', () => {
  it('toggles light/dark with accessible label', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ThemeToggle />);

    const toggle = screen.getByTestId('theme-toggle');
    expect(toggle).toHaveAttribute('aria-label', 'Switch to light mode');
    expect(document.documentElement.classList.contains('light')).toBe(false);

    await user.click(toggle);
    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(toggle).toHaveAttribute('aria-label', 'Switch to dark mode');
    expect(localStorage.getItem('theme')).toBe('light');
  });
});