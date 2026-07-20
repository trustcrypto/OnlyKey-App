import { describe, expect, it } from 'vitest';
import { generatePassword, DEFAULT_PASSWORD_OPTIONS } from '../passwordGenerator';

describe('passwordGenerator', () => {
  it('generates password with requested length', () => {
    const password = generatePassword({ ...DEFAULT_PASSWORD_OPTIONS, length: 16 });
    expect(password).toHaveLength(16);
  });

  it('throws when no charset selected', () => {
    expect(() => generatePassword({
      ...DEFAULT_PASSWORD_OPTIONS,
      upper: false,
      lower: false,
      digits: false,
      special: false,
    })).toThrow();
  });

  it('omits excluded characters', () => {
    const password = generatePassword({
      ...DEFAULT_PASSWORD_OPTIONS,
      length: 32,
      upper: false,
      lower: true,
      digits: false,
      special: false,
      omit: 'aeiou',
    });
    expect(password).not.toMatch(/[aeiou]/);
  });
});