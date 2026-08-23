import { describe, expect, it } from 'vitest';

import { TerminologyResourceValidator } from '../terminology-resource-validator';
import { ValueSetCache } from '../valueset-cache';
import { ValueSetValidator } from '../valueset-validator';

describe('external terminology registration', () => {
  it('shares registered CodeSystems with synchronous terminology resource rules', () => {
    const cache = new ValueSetCache();
    const valueSetValidator = new ValueSetValidator(cache);
    const terminologyResourceValidator = new TerminologyResourceValidator(cache);

    expect(valueSetValidator.registerExternalTerminologyResource({
      resourceType: 'CodeSystem',
      url: 'http://example.test/CodeSystem/filter-target',
      status: 'active',
      content: 'complete',
      property: [{ code: 'related', type: 'Coding' }],
    }, 'R4')).toBe(true);

    const issues = terminologyResourceValidator.validate({
      resourceType: 'ValueSet',
      url: 'http://example.test/ValueSet/filter-test',
      status: 'active',
      compose: {
        include: [{
          system: 'http://example.test/CodeSystem/filter-target',
          filter: [{ property: 'related', op: '=', value: 'not-a-system-code' }],
        }],
      },
    }, 'R4');

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'tx-valueset-filter-value-format',
      path: 'ValueSet.compose.include[0].filter[0]',
    }));
  });
});
