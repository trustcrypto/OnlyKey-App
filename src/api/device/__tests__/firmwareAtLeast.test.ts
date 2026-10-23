import { describe, it, expect } from 'vitest';
import { firmwareAtLeast } from '../firmwareConstants';

describe('firmwareAtLeast', () => {
  it('compares the numeric version and ignores the build keyword', () => {
    expect(firmwareAtLeast('v3.1.0-prodc', 3, 1, 0)).toBe(true);
    expect(firmwareAtLeast('v3.1.0-test-9fceea1-37aa531', 3, 1, 0)).toBe(true);
    expect(firmwareAtLeast('v3.2.0-prod', 3, 1, 0)).toBe(true);
    expect(firmwareAtLeast('v4.0.0', 3, 1, 0)).toBe(true);
    expect(firmwareAtLeast('v3.0.4-prodp', 3, 1, 0)).toBe(false);
    expect(firmwareAtLeast('v2.1.2 STD', 3, 1, 0)).toBe(false);
    expect(firmwareAtLeast('', 3, 1, 0)).toBe(false);
  });
});
