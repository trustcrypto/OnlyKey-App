import './mocks/desktop';
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { resetDeviceStoreForTests } from './store';

beforeEach(() => {
  document.documentElement.classList.remove('light');
  document.documentElement.style.colorScheme = 'dark';
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal('confirm', vi.fn(() => false));
  vi.stubGlobal('alert', vi.fn());
});

afterEach(async () => {
  cleanup();
  await resetDeviceStoreForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});