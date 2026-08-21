import { describe, expect, it } from 'vitest';
import {
  arrayToHexString,
  base64ToHex,
  hexStringToByteArray,
  hexToModhex,
  parseBackupData,
  parseFirmwareData,
  strPad,
} from '../utils';

describe('device utils', () => {
  it('converts hex to modhex and back', () => {
    expect(hexToModhex('0123456789abcdef')).toBe('cbdefghijklnrtuv');
    expect(hexToModhex('cbdefghijklnrtuv', true)).toBe('0123456789abcdef');
  });

  it('rejects invalid hexToModhex characters', () => {
    expect(() => hexToModhex('zz')).toThrow(/Invalid character/);
  });

  it('round-trips byte arrays and hex strings', () => {
    expect(arrayToHexString([0, 15, 255])).toBe('000FFF');
    expect(hexStringToByteArray('000fff')).toEqual([0, 15, 255]);
  });

  it('rejects invalid hex strings', () => {
    expect(() => hexStringToByteArray('gg')).toThrow(/Invalid hex/);
    expect(() => hexStringToByteArray('abc')).toThrow(/Invalid hex/);
  });

  it('pads strings', () => {
    expect(strPad(7, 3)).toBe('007');
    expect(strPad('ab', 4, 'x')).toBe('xxab');
  });

  it('decodes base64 to hex', () => {
    expect(base64ToHex(btoa('Hi'))).toBe('4869');
  });

  it('parses backup files, skipping comments and blanks', () => {
    const contents = '-- comment\n\nSGk=\n-- end\n';
    expect(parseBackupData(contents)).toBe('4869');
  });

  it('parses firmware files and drops the signed header', () => {
    const contents = '-----BEGIN SIGNED FIRMWARE-----\naabbcc\n\n-- skip\nddee\n';
    expect(parseFirmwareData(contents)).toEqual(['aabbcc', 'ddee']);
  });

  it('rejects firmware files with non-hex blocks', () => {
    expect(() => parseFirmwareData('-----BEGIN SIGNED FIRMWARE-----\nnot-hex\n')).toThrow(/Invalid hex/);
  });
});
