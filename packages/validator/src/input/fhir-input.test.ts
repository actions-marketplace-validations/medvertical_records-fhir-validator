import { describe, expect, it } from 'vitest';
import { parseFhirNdjson } from './fhir-ndjson-input';
import { parseFhirXml } from './fhir-xml-input';

describe('secure FHIR XML input adapter', () => {
  it('normalizes primitives, primitive extensions, arrays, contained resources, and XHTML', () => {
    const parsed = parseFhirXml(`<?xml version="1.0"?>
<Patient xmlns="http://hl7.org/fhir">
  <id value="patient-1"/>
  <active value="true"/>
  <name>
    <family value="Muster"/>
    <given value="Ada"/>
    <given value="Lovelace"/>
  </name>
  <birthDate value="1815-12-10">
    <extension url="http://hl7.org/fhir/StructureDefinition/patient-birthTime">
      <valueDateTime value="1815-12-10T12:00:00Z"/>
    </extension>
  </birthDate>
  <text>
    <status value="generated"/>
    <div xmlns="http://www.w3.org/1999/xhtml"><p>Ada <b>safe</b> &amp; cared for</p></div>
  </text>
  <contained>
    <Organization>
      <id value="org-1"/>
      <name value="Analytical Engine"/>
    </Organization>
  </contained>
</Patient>`);

    expect(parsed.format).toBe('xml');
    expect(parsed.resources[0]).toMatchObject({
      resourceType: 'Patient',
      id: 'patient-1',
      active: true,
      name: [{
        family: 'Muster',
        given: ['Ada', 'Lovelace'],
      }],
      birthDate: '1815-12-10',
      _birthDate: {
        extension: [{
          url: 'http://hl7.org/fhir/StructureDefinition/patient-birthTime',
          valueDateTime: '1815-12-10T12:00:00Z',
        }],
      },
      contained: [{
        resourceType: 'Organization',
        id: 'org-1',
        name: 'Analytical Engine',
      }],
    });
    expect((parsed.resources[0].text as { div: string }).div)
      .toContain(
        '<div xmlns="http://www.w3.org/1999/xhtml"><p>Ada <b>safe</b> &amp; cared for</p></div>',
      );
    expect(parsed.sourceMap['Patient.birthDate']).toEqual(expect.objectContaining({
      line: expect.any(Number),
      column: expect.any(Number),
    }));
  });

  it('normalizes Bundle entry resource wrappers', () => {
    const parsed = parseFhirXml(`<Bundle xmlns="http://hl7.org/fhir">
  <type value="collection"/>
  <entry>
    <fullUrl value="urn:uuid:patient-1"/>
    <resource><Patient><id value="patient-1"/></Patient></resource>
  </entry>
</Bundle>`);
    expect(parsed.resources[0]).toMatchObject({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [{
        fullUrl: 'urn:uuid:patient-1',
        resource: { resourceType: 'Patient', id: 'patient-1' },
      }],
    });
  });

  it('aligns primitive-extension sidecars in repeating primitive arrays', () => {
    const parsed = parseFhirXml(`<Patient xmlns="http://hl7.org/fhir">
  <name>
    <given value="Ada"/>
    <given value="Lovelace">
      <extension url="https://example.test/fhir/StructureDefinition/demo">
        <valueString value="preferred"/>
      </extension>
    </given>
  </name>
</Patient>`);

    expect(parsed.resources[0]).toMatchObject({
      name: [{
        given: ['Ada', 'Lovelace'],
        _given: [
          null,
          {
            extension: [{
              url: 'https://example.test/fhir/StructureDefinition/demo',
              valueString: 'preferred',
            }],
          },
        ],
      }],
    });
  });

  it('preserves integer64 values without JavaScript number precision loss', () => {
    const parsed = parseFhirXml(`<TestResource xmlns="http://hl7.org/fhir">
  <valueInteger64 value="9007199254740993"/>
</TestResource>`);

    expect(parsed.resources[0].valueInteger64).toBe('9007199254740993');
  });

  it('rejects non-string runtime input with a stable boundary error', () => {
    expect(() => parseFhirXml(null as unknown as string)).toThrow('must be a string');
  });

  it('rejects DTD/entity input, foreign namespaces, depth bombs, and oversized input', () => {
    expect(() => parseFhirXml(
      '<!DOCTYPE Patient [<!ENTITY x SYSTEM "file:///etc/passwd">]><Patient xmlns="http://hl7.org/fhir"/>',
    )).toThrow('DTD and entity');
    expect(() => parseFhirXml('<Patient xmlns="urn:not-fhir"/>')).toThrow('unsupported namespace');
    expect(() => parseFhirXml(
      '<Patient xmlns="http://hl7.org/fhir"><x:constructor xmlns:x="urn:evil"/></Patient>',
    )).toThrow('unsupported namespace');
    expect(() => parseFhirXml(
      '<Patient xmlns="http://hl7.org/fhir" xmlns:x="urn:evil"><id x:value="forged"/></Patient>',
    )).toThrow('unsupported attribute namespace');
    expect(() => parseFhirXml(
      '<Patient xmlns="http://hl7.org/fhir"><contact><name/></contact></Patient>',
      { maxDepth: 2 },
    )).toThrow('depth limit');
    expect(() => parseFhirXml('<Patient xmlns="http://hl7.org/fhir"/>', { maxBytes: 4 }))
      .toThrow('byte limit');
  });
});

describe('bounded FHIR NDJSON input adapter', () => {
  it('parses one resource per line and records line locations', () => {
    const parsed = parseFhirNdjson([
      '{"resourceType":"Patient","id":"p1"}',
      '{"resourceType":"Observation","id":"o1"}',
      '',
    ].join('\n'));
    expect(parsed.resources).toHaveLength(2);
    expect(parsed.sourceMap).toEqual({
      'resources[0]': { line: 1, column: 1 },
      'resources[1]': { line: 2, column: 1 },
    });
  });

  it('rejects blank records, missing resourceType, record bombs, and long lines', () => {
    expect(() => parseFhirNdjson(
      '{"resourceType":"Patient"}\n\n{"resourceType":"Observation"}',
    )).toThrow('line 2 is empty');
    expect(() => parseFhirNdjson('{"id":"p1"}')).toThrow('missing resourceType');
    expect(() => parseFhirNdjson(
      '{"resourceType":"Patient"}\n{"resourceType":"Observation"}',
      { maxRecords: 1 },
    )).toThrow('record limit');
    expect(() => parseFhirNdjson('{"resourceType":"Patient"}', { maxLineBytes: 4 }))
      .toThrow('line 1 exceeded byte limit');
  });
});
