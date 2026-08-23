import { describe, expect, it } from 'vitest';
import {
  findIllegalXmlCharacters,
  formatIllegalXmlCharacterMessage,
  isWhitespaceOnlyString,
} from '../string-character-rules';

describe('isWhitespaceOnlyString', () => {
  it('treats U+0085 NEL as whitespace alongside JS \\s', () => {
    expect(isWhitespaceOnlyString('\t\n\u000b\u000c\r \u0085\u00a0\u1680\u2000\u3000')).toBe(true);
  });

  it('rejects the empty string and strings with content', () => {
    expect(isWhitespaceOnlyString('')).toBe(false);
    expect(isWhitespaceOnlyString(' a ')).toBe(false);
  });
});

describe('findIllegalXmlCharacters', () => {
  it('reports each distinct XML-illegal control character once, as hex', () => {
    expect(findIllegalXmlCharacters('a\u000bb\u000cc\u000b')).toEqual(['b', 'c']);
    expect(findIllegalXmlCharacters('bad:\u0013')).toEqual(['13']);
  });

  it('permits tab, LF, CR and everything from U+0020 upward', () => {
    expect(findIllegalXmlCharacters('line1\nline2\tend\r \u0085\u00a0')).toEqual([]);
  });
});

describe('formatIllegalXmlCharacterMessage', () => {
  it('uses the singular reference-validator wording for one character', () => {
    expect(formatIllegalXmlCharacterMessage(['13'])).toContain('the character [13] (hex value)');
  });

  it('uses the plural reference-validator wording for several characters', () => {
    expect(formatIllegalXmlCharacterMessage(['b', 'c'])).toContain('the characters [b, c] (hex values)');
  });
});
