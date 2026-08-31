import { describe, expect, it } from 'vitest';

import type { StructureDefinition } from '../../core/structure-definition-types';
import { SDConstraintCollector } from '../sd-constraint-collector';

const constraint = (key: string) => ({
  key,
  severity: 'error' as const,
  human: key,
  expression: 'exists()',
});

describe('SDConstraintCollector', () => {
  it('does not stop nested path checks at the first array', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/Patient',
      name: 'Patient',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { path: 'Patient', constraint: [constraint('root')] },
          { path: 'Patient.contact.name.given', constraint: [constraint('given')] },
        ],
      },
    };
    const collector = new SDConstraintCollector();

    const mandatory = collector.getMandatoryConstraints(profile, {
      resourceType: 'Patient',
      contact: [{ name: [{}] }],
    });

    expect(mandatory.map(item => item.constraint.key)).toEqual(['root']);
  });

  it('distinguishes choice values from prefix-sharing properties', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/ElementDefinition',
      name: 'ElementDefinition',
      status: 'draft',
      kind: 'complex-type',
      abstract: false,
      type: 'ElementDefinition',
      snapshot: {
        element: [
          { path: 'ElementDefinition' },
          { path: 'ElementDefinition.value[x]', constraint: [constraint('choice')] },
        ],
      },
    };
    const collector = new SDConstraintCollector();

    expect(collector.getMandatoryConstraints(profile, {
      resourceType: 'ElementDefinition',
      valueSet: 'http://example.org/ValueSet/example',
    })).toEqual([]);
    expect(collector.getMandatoryConstraints(profile, {
      resourceType: 'ElementDefinition',
      valueString: 'present',
    })).toHaveLength(1);
  });

  it('resolves datatype paths without an instance resourceType', () => {
    const profile: StructureDefinition = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StructureDefinition/Extension',
      name: 'Extension',
      status: 'draft',
      kind: 'complex-type',
      abstract: false,
      type: 'Extension',
      snapshot: {
        element: [
          { path: 'Extension' },
          { path: 'Extension.url', constraint: [constraint('url')] },
        ],
      },
    };

    expect(new SDConstraintCollector().getMandatoryConstraints(
      profile,
      { url: 'http://example.org/extension' },
    )).toHaveLength(1);
  });
});
