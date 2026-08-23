import { describe, expect, it } from 'vitest';
import { matchTypeDiscriminator } from '../slice-type-discriminator';
import type { SliceDefinition } from '../slice-types';

// eu.laboratory Observation.value[x] uses a CLOSED type-discriminated
// slicing ($this). Complex datatypes carry no runtime type marker, so the
// matcher must recognise them by shape or every Ratio/Range/SampledData
// value falsely fails the whole closed slicing.
const slice = (sliceName: string, code: string): SliceDefinition =>
  ({ sliceName, type: [{ code }] } as SliceDefinition);

describe('type discriminator: complex datatype shapes', () => {
  it('matches a Ratio value against a Ratio slice', () => {
    const ratio = {
      numerator: { value: 15, unit: 'mg', system: 'http://unitsofmeasure.org', code: 'mg' },
      denominator: { value: 24, unit: 'h', system: 'http://unitsofmeasure.org', code: 'h' },
    };
    expect(matchTypeDiscriminator(ratio, slice('valueRatio', 'Ratio'), '$this')).toBe(true);
  });

  it('matches a Range value against a Range slice', () => {
    const range = { low: { value: 1, unit: 'mg' }, high: { value: 2, unit: 'mg' } };
    expect(matchTypeDiscriminator(range, slice('valueRange', 'Range'), '$this')).toBe(true);
  });

  it('matches a SampledData value against a SampledData slice', () => {
    const sampled = {
      origin: { value: 0 },
      period: 100,
      dimensions: 1,
      data: '1 2 3',
    };
    expect(matchTypeDiscriminator(sampled, slice('valueSampledData', 'SampledData'), '$this')).toBe(true);
  });

  it('does not match a Ratio value against a Quantity slice', () => {
    const ratio = { numerator: { value: 1 }, denominator: { value: 2 } };
    expect(matchTypeDiscriminator(ratio, slice('valueQuantity', 'Quantity'), '$this')).toBe(false);
  });

  it('does not match a foreign-shaped object against a Ratio slice', () => {
    const period = { start: '2020-01-01', end: '2020-01-02' };
    expect(matchTypeDiscriminator(period, slice('valueRatio', 'Ratio'), '$this')).toBe(false);
  });
});

// PoCD MdsDevice slices extension value[x] by type with a single closed
// valueUnsignedInt slice; the instance value is a bare JSON number, so the
// integer family must match by value shape.
describe('type discriminator: numeric primitive shapes', () => {
  it('matches a non-negative integer against an unsignedInt slice', () => {
    expect(matchTypeDiscriminator(8760, slice('valueUnsignedInt', 'unsignedInt'), '$this')).toBe(true);
    expect(matchTypeDiscriminator(0, slice('valueUnsignedInt', 'unsignedInt'), '$this')).toBe(true);
  });

  it('does not match a negative or fractional number against an unsignedInt slice', () => {
    expect(matchTypeDiscriminator(-1, slice('valueUnsignedInt', 'unsignedInt'), '$this')).toBe(false);
    expect(matchTypeDiscriminator(1.5, slice('valueUnsignedInt', 'unsignedInt'), '$this')).toBe(false);
  });

  it('matches a positive integer against a positiveInt slice but rejects zero', () => {
    expect(matchTypeDiscriminator(156, slice('valuePositiveInt', 'positiveInt'), '$this')).toBe(true);
    expect(matchTypeDiscriminator(0, slice('valuePositiveInt', 'positiveInt'), '$this')).toBe(false);
  });

  it('matches a whole number against a decimal slice', () => {
    expect(matchTypeDiscriminator(5, slice('valueDecimal', 'decimal'), '$this')).toBe(true);
  });

  it('does not match a number against a string slice', () => {
    expect(matchTypeDiscriminator(5, slice('valueString', 'string'), '$this')).toBe(false);
  });
});

// BALP ihe-otherId slices Extension.value[x] CLOSED with a single
// valueIdentifier slice; real identifiers legally carry only type+value
// (no system), so Identifier must be recognisable by shape.
describe('type discriminator: Identifier shape', () => {
  it('matches a type+value identifier against an Identifier slice', () => {
    const identifier = {
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'NPI' }] },
      value: '1234567@myNPIregistry.example.org',
    };
    expect(matchTypeDiscriminator(identifier, slice('valueIdentifier', 'Identifier'), '$this')).toBe(true);
  });

  it('matches a system+value identifier against an Identifier slice', () => {
    const identifier = { system: 'urn:ietf:rfc:3986', value: 'urn:oid:1.2.3' };
    expect(matchTypeDiscriminator(identifier, slice('valueIdentifier', 'Identifier'), '$this')).toBe(true);
  });

  it('does not match a Quantity-shaped value against an Identifier slice', () => {
    expect(matchTypeDiscriminator({ value: 5 }, slice('valueIdentifier', 'Identifier'), '$this')).toBe(false);
  });

  it('does not match a CodeableConcept against an Identifier slice', () => {
    const concept = { coding: [{ system: 'http://loinc.org', code: '1234-5' }] };
    expect(matchTypeDiscriminator(concept, slice('valueIdentifier', 'Identifier'), '$this')).toBe(false);
  });
});
