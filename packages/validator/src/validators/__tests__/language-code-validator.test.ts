import { describe, expect, it } from 'vitest';
import { parseLanguageTag, validateResourceLanguage } from '../language-code-validator';

describe('parseLanguageTag (HL7 LanguageTag parity, core 6.10.0)', () => {
  it.each(['en', 'de', 'de-CH', 'en-US', 'en-AU', 'zh-Hans', 'sga', 'sr-Latn-RS'])(
    'accepts the registered tag %s',
    tag => {
      expect(parseLanguageTag(tag)).toBeNull();
    },
  );

  it.each([
    ['zz', 'unregistered primary subtag'],
    ['zz-INVALID', 'unregistered primary subtag with region-ish rest'],
    ['not a lang!', 'free text'],
    ['EN', 'case-sensitive registry lookup, like the Java HashMap'],
    ['i-klingon', 'grandfathered tags are rejected by the Java parser'],
    ['x-private', 'private-use-only tags are rejected by the Java parser'],
  ])('rejects %s on the primary subtag (%s)', tag => {
    expect(parseLanguageTag(tag)).toMatch(/primary language subtag/);
  });

  it.each([
    ['de-QQ', 'unknown region'],
    ['en-US-INVALID', 'unknown variant'],
    ['de-DE-x-goethe', 'the Java parser consumes x but not the part after it'],
    ['de-de', 'lowercase region is not a registry key'],
  ])('rejects %s on a later part (%s)', tag => {
    expect(parseLanguageTag(tag)).toMatch(/unable to recognise part/);
  });

  it('keeps the Java quirk of consuming any part that starts with x as private use', () => {
    expect(parseLanguageTag('en-xyz')).toBeNull();
  });
});

describe('validateResourceLanguage', () => {
  it('warns on an invalid Resource.language', () => {
    const issues = validateResourceLanguage(
      { resourceType: 'Patient', language: 'zz-INVALID' },
      'Patient',
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'language-code-invalid',
      severity: 'warning',
      path: 'Patient.language',
    });
  });

  it('accepts a valid Resource.language', () => {
    expect(validateResourceLanguage({ resourceType: 'Patient', language: 'de-CH' }, 'Patient'))
      .toHaveLength(0);
  });

  it('ignores resources without a language', () => {
    expect(validateResourceLanguage({ resourceType: 'Patient' }, 'Patient')).toHaveLength(0);
    expect(validateResourceLanguage({ resourceType: 'Patient', language: '' }, 'Patient'))
      .toHaveLength(0);
  });

  it('never looks at nested language properties like Expression.language', () => {
    const resource = {
      resourceType: 'Measure',
      library: [{ language: 'text/cql' }],
    };
    expect(validateResourceLanguage(resource, 'Measure')).toHaveLength(0);
  });
});
