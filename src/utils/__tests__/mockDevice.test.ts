import { describe, it, expect, afterEach, vi } from 'vitest';
import { shouldUseMockDevice } from '../mockDevice';

describe('shouldUseMockDevice', () => {
  const originalLocation = window.location;

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('returns true when VITE_MOCK_DEVICE env is set', () => {
    expect(shouldUseMockDevice()).toBe(true);
  });

  it('returns false when mock=0 is in the query string', () => {
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost:5173/?mock=0'),
      writable: true,
    });
    expect(shouldUseMockDevice()).toBe(false);
  });

  it('returns true when mock=1 is in the query string', () => {
    vi.stubEnv('VITE_MOCK_DEVICE', '');
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost:5173/?mock=1'),
      writable: true,
    });
    expect(shouldUseMockDevice()).toBe(true);
  });
});