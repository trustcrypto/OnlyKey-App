import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordGeneratorDialog from '../PasswordGeneratorDialog';
import { renderWithProviders } from '../../../test/render';

describe('PasswordGeneratorDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <PasswordGeneratorDialog open={false} onClose={vi.fn()} onApply={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('generates and applies a password', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(<PasswordGeneratorDialog open onClose={onClose} onApply={onApply} />);

    await user.click(screen.getByRole('button', { name: /^generate$/i }));
    const output = screen.getByPlaceholderText(/click generate/i) as HTMLInputElement;
    expect(output.value.length).toBeGreaterThan(5);

    await user.click(screen.getByRole('button', { name: /use password/i }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(String(onApply.mock.calls[0][0]).length).toBeGreaterThan(5);
    expect(onClose).toHaveBeenCalled();
  });
});
