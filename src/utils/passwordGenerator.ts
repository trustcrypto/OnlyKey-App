export interface PasswordGeneratorOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  special: boolean;
  punct: boolean;
  braces: boolean;
  space: boolean;
  omit: string;
}

const CHARSETS = {
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lower: 'abcdefghijklmnopqrstuvwxyz',
  digits: '0123456789',
  special: '~!@#$%^&*+=-_',
  punct: '"\';:,.?',
  braces: '(){}[]<>',
  space: ' ',
} as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildCharset(options: PasswordGeneratorOptions): string {
  let charset = '';
  if (options.upper) charset += CHARSETS.upper;
  if (options.lower) charset += CHARSETS.lower;
  if (options.digits) charset += CHARSETS.digits;
  if (options.special) charset += CHARSETS.special;
  if (options.punct) charset += CHARSETS.punct;
  if (options.braces) charset += CHARSETS.braces;
  if (options.space) charset += CHARSETS.space;

  if (options.omit) {
    const omitRegex = new RegExp(`[${escapeRegExp(options.omit)}]`, 'g');
    charset = charset.replace(omitRegex, '');
  }

  return charset;
}

function randomIndex(max: number): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function randomChar(charset: string, allowSpace: boolean, isEdge: boolean): string {
  let char = charset[randomIndex(charset.length)];
  if (allowSpace && isEdge && char === ' ') {
    let attempts = 0;
    while (char === ' ' && attempts < 32) {
      char = charset[randomIndex(charset.length)];
      attempts++;
    }
  }
  return char;
}

export function generatePassword(options: PasswordGeneratorOptions): string {
  const length = Math.min(56, Math.max(6, options.length));
  const charset = buildCharset(options);
  if (!charset.length) {
    throw new Error('Select at least one character set with available characters.');
  }

  let password = '';
  for (let i = 0; i < length; i++) {
    password += randomChar(charset, options.space, i === 0 || i === length - 1);
  }
  return password;
}

export const DEFAULT_PASSWORD_OPTIONS: PasswordGeneratorOptions = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  special: true,
  punct: false,
  braces: false,
  space: false,
  omit: '',
};