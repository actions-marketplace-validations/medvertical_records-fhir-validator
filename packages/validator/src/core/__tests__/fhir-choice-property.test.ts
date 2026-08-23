import { describe, expect, it } from 'vitest';

import {
  isChoiceSidecarProperty,
  isConcreteChoiceProperty,
  splitConcreteChoiceProperty,
} from '../fhir-choice-property';

describe('FHIR choice properties', () => {
  it('accepts primitive and complex FHIR type suffixes', () => {
    expect(isConcreteChoiceProperty('valueString', 'value')).toBe(true);
    expect(isConcreteChoiceProperty('effectivePeriod', 'effective')).toBe(true);
    expect(isChoiceSidecarProperty('_valueDateTime', 'value')).toBe(true);
    expect(splitConcreteChoiceProperty('subjectReference')).toEqual({
      baseName: 'subject',
      typeSuffix: 'Reference',
    });
  });

  it('rejects ordinary properties that merely share the same prefix', () => {
    expect(isConcreteChoiceProperty('valueSet', 'value')).toBe(false);
    expect(isConcreteChoiceProperty('valueRequired', 'value')).toBe(false);
    expect(isConcreteChoiceProperty('valuefoo', 'value')).toBe(false);
    expect(isChoiceSidecarProperty('_valueSet', 'value')).toBe(false);
  });
});
