import { describe, expect, it } from 'vitest';
import { isPublicProfileUrl } from './remote-profile-url-policy';

describe('isPublicProfileUrl', () => {
  it.each([
    'https://fhir.example.org/StructureDefinition/Patient',
    'https://fcorp.example/StructureDefinition/Patient',
    'http://hl7.org/fhir/StructureDefinition/Patient|4.0.1',
  ])('accepts a syntactically public canonical', canonical => {
    expect(isPublicProfileUrl(canonical)).toBe(true);
  });

  it.each([
    'urn:uuid:profile',
    'https://localhost/StructureDefinition/Patient',
    'https://service.internal/StructureDefinition/Patient',
    'http://127.0.0.1/StructureDefinition/Patient',
    'http://2130706433/StructureDefinition/Patient',
    'http://10.1.2.3/StructureDefinition/Patient',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/StructureDefinition/Patient',
    'https://user:secret@example.org/StructureDefinition/Patient',
  ])('rejects an internal or unsafe canonical', canonical => {
    expect(isPublicProfileUrl(canonical)).toBe(false);
  });
});
