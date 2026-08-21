import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import {
  ConfigRequired,
  PrefBlock,
  PrefHint,
  PrefWarning,
  TwoColPanel,
} from '../forms';
import { renderWithProviders } from '../../../test/render';

describe('form primitives', () => {
  it('renders pref helpers', () => {
    renderWithProviders(
      <PrefBlock>
        <ConfigRequired>Need config</ConfigRequired>
        <PrefHint>hint</PrefHint>
        <PrefWarning>warn</PrefWarning>
        <TwoColPanel left={<span>L</span>} right={<span>R</span>} />
      </PrefBlock>,
    );
    expect(screen.getByText('Need config')).toBeInTheDocument();
    expect(screen.getByText('hint')).toBeInTheDocument();
    expect(screen.getByText('warn')).toBeInTheDocument();
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText('R')).toBeInTheDocument();
  });
});
