import { describe, expect, it } from 'vitest';
import { findDashes } from '../../scripts/check-style.mjs';

describe('findDashes', () => {
  it('finds an em dash with its line and column', () => {
    expect(findDashes('first line\nab\u2014cd')).toEqual([{ line: 2, column: 3, char: '\u2014' }]);
  });

  it('finds an en dash with its line and column', () => {
    expect(findDashes('\u2013 start')).toEqual([{ line: 1, column: 1, char: '\u2013' }]);
  });

  it('finds both on CRLF text', () => {
    expect(findDashes('a\r\nb \u2014 c \u2013 d')).toEqual([
      { line: 2, column: 3, char: '\u2014' },
      { line: 2, column: 7, char: '\u2013' },
    ]);
  });

  it('returns an empty array for plain text with hyphens', () => {
    expect(findDashes('well-known, self-hosted - plain text')).toEqual([]);
  });
});
