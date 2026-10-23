import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PrivateKeySelectDialog from '../PrivateKeySelectDialog';
import { renderWithProviders } from '../../../test/render';

const candidates = [
  { id: '0', name: 'Primary Key', type: 2, keyData: [1], kind: 'rsa' as const },
  { id: '1', name: 'Subkey 1', type: 2, keyData: [2], kind: 'rsa' as const },
];

describe('PrivateKeySelectDialog', () => {
  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <PrivateKeySelectDialog open={false} candidates={candidates} onClose={() => {}} onConfirm={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('confirms the selected candidate and slot', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <PrivateKeySelectDialog open candidates={candidates} onClose={onClose} onConfirm={onConfirm} />,
    );
    await user.click(screen.getByText('Subkey 1'));
    await user.selectOptions(screen.getByRole('combobox'), '101');
    await user.click(screen.getByRole('button', { name: /load key/i }));
    expect(onConfirm).toHaveBeenCalledWith('1', 101);
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('preselects the first candidate and RSA slot 1 after opening from an empty mount', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const { rerender } = renderWithProviders(
      <PrivateKeySelectDialog open={false} candidates={[]} onClose={() => {}} onConfirm={onConfirm} />,
    );
    rerender(
      <PrivateKeySelectDialog open candidates={candidates} onClose={() => {}} onConfirm={onConfirm} />,
    );
    await user.click(screen.getByRole('button', { name: /load key/i }));
    expect(onConfirm).toHaveBeenCalledWith('0', 1);
  });

  it('defaults ECC candidates to slot 101 and resets when a new bundle opens', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const ecc = [
      { id: '0', name: 'ECC Primary', type: 1, keyData: [1], kind: 'ecc' as const },
      { id: '1', name: 'ECC Subkey', type: 1, keyData: [2], kind: 'ecc' as const },
    ];
    const { rerender } = renderWithProviders(
      <PrivateKeySelectDialog open candidates={candidates} onClose={() => {}} onConfirm={onConfirm} />,
    );
    rerender(
      <PrivateKeySelectDialog open candidates={ecc} onClose={() => {}} onConfirm={onConfirm} />,
    );
    expect(screen.getByRole('combobox')).toHaveValue('101');
    await user.click(screen.getByText('ECC Subkey'));
    expect(screen.getByRole('combobox')).toHaveValue('101');
    await user.click(screen.getByRole('button', { name: /load key/i }));
    expect(onConfirm).toHaveBeenCalledWith('1', 101);
  });
});
