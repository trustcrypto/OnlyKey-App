import React from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { initTheme } from '../utils/theme';

export function renderWithProviders(ui: React.ReactElement, options?: RenderOptions) {
  initTheme();
  return render(ui, options);
}