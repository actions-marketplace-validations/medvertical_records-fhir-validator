import { describe, expect, it } from 'vitest';
import { StructureDefinitionValidator } from '../structure-definition-validator';

describe('StructureDefinitionValidator WG consistency rules', () => {
  const validator = new StructureDefinitionValidator();

  it('accepts official HL7 publisher and committee URL variants for the nominated WG', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      id: 'Account',
      url: 'http://hl7.org/fhir/StructureDefinition/Account',
      extension: [{
        url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-wg',
        valueCode: 'pa',
      }],
      publisher: 'Health Level Seven International (Patient Administration)',
      contact: [{
        telecom: [{
          system: 'url',
          value: 'http://www.hl7.org/Special/committees/pafm/index.cfm',
        }],
      }],
    });

    expect(issues.filter(issue => issue.code.startsWith('business-rule-wg-'))).toHaveLength(0);
  });

  it('checks StructureDefinition publisher/contact consistency against the nominated WG', () => {
    const issues = validator.validate({
      resourceType: 'StructureDefinition',
      id: 'Account',
      url: 'http://hl7.org/fhir/StructureDefinition/Account',
      extension: [{
        url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-wg',
        valueCode: 'pa',
      }],
      publisher: 'Example Publisher',
      contact: [{
        telecom: [{
          system: 'url',
          value: 'http://example.org/wg',
        }],
      }],
    });

    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'business-rule-wg-publisher' }),
      expect.objectContaining({ code: 'business-rule-wg-contact' }),
    ]));
  });

  it('does not apply StructureDefinition WG consistency rules to ValueSet resources', () => {
    const issues = validator.validate({
      resourceType: 'ValueSet',
      id: 'v2-0092',
      url: 'http://terminology.hl7.org/ValueSet/v2-0092',
      extension: [{
        url: 'http://hl7.org/fhir/StructureDefinition/structuredefinition-wg',
        valueCode: 'pa',
      }],
      publisher: 'HL7, Inc',
      contact: [{
        telecom: [{
          system: 'url',
          value: 'http://hl7.org',
        }],
      }],
    });

    expect(issues.filter(issue => issue.code.startsWith('business-rule-wg-'))).toHaveLength(0);
  });
});
