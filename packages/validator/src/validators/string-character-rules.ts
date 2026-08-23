/**
 * Character-level lexical rules for FHIR string primitives, shared by the
 * whitespace-only sanity rule and the string padding check so both agree on
 * what counts as whitespace.
 */

// JS `\s` misses U+0085 (NEL), which both Unicode and the HL7 reference
// validator treat as whitespace — without it the params-ws exotic-whitespace
// fixture reads as "has content" and the wrong rule fires.
const WHITESPACE_ONLY = /^[\s\u0085]+$/;

export function isWhitespaceOnlyString(value: string): boolean {
  return value.length > 0 && WHITESPACE_ONLY.test(value);
}

// XML 1.0 forbids C0 control characters other than tab (0x09), LF (0x0a) and
// CR (0x0d). FHIR instances must survive JSON→XML round-trips, so the
// reference validator warns on them in any string value ("illegal in the XML
// version of FHIR"). Code-point comparison instead of a character-class regex
// keeps control characters out of source and satisfies no-control-regex.
function isIllegalXmlCodePoint(codePoint: number): boolean {
  return codePoint < 0x20 && codePoint !== 0x09 && codePoint !== 0x0a && codePoint !== 0x0d;
}

/** Distinct offending characters as lowercase hex, in order of appearance. */
export function findIllegalXmlCharacters(value: string): string[] {
  const seen = new Set<string>();
  const hexes: string[] = [];
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    if (!isIllegalXmlCodePoint(codePoint)) continue;
    const hex = codePoint.toString(16);
    if (seen.has(hex)) continue;
    seen.add(hex);
    hexes.push(hex);
  }
  return hexes;
}

/** Mirrors the HL7 reference validator's wording, singular vs plural. */
export function formatIllegalXmlCharacterMessage(hexes: string[]): string {
  return hexes.length === 1
    ? `This content includes the character [${hexes[0]}] (hex value). `
      + 'This character is illegal in the XML version of FHIR, and there is generally no valid use for such characters'
    : `This content includes the characters [${hexes.join(', ')}] (hex values). `
      + 'These characters are illegal in the XML version of FHIR, and there is generally no valid use for such characters';
}
