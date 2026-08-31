import { describe, expect, it } from 'vitest';
import { dedupeIssues } from '../validation-utils';
import { validationIssue as issue } from './validation-issue-test-builders';

const terminologyDetails = {
  system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
  code: 'PRN',
  display: 'Provider identifier',
};

describe('Bundle entry terminology dedupe', () => {
  it('prefers the resource-qualified child display finding over its parent copy', () => {
    const parent = issue({
      aspect: 'terminology',
      severity: 'warning',
      code: 'terminology-display-mismatch',
      message: 'Wrong Display Name Provider identifier',
      path: 'Bundle.entry[0].resource.identifier[0].type.coding[0].display',
      resourceType: 'Bundle',
      details: terminologyDetails,
    });
    const child = issue({
      aspect: 'terminology',
      severity: 'error',
      code: 'terminology-display-mismatch',
      message: 'Wrong Display Name Provider identifier',
      path:
        'Bundle.entry[0].resource/*Practitioner/practitioner-1*/.identifier[0].type.coding[0].display',
      resourceType: 'Practitioner',
      details: {
        ...terminologyDetails,
        fieldPath: 'Practitioner.identifier[0].type.coding[0].display',
        bundleUnit: {
          entryIndex: 0,
          resourceType: 'Practitioner',
          resourceId: 'practitioner-1',
        },
      },
    });

    expect(dedupeIssues([parent, child])).toEqual([child]);
  });

  it('prefers a resource-qualified child for otherwise exact terminology copies', () => {
    const parent = issue({
      aspect: 'terminology',
      severity: 'warning',
      code: 'terminology-code-inactive',
      message: 'The concept PRN is inactive',
      path: 'Bundle.entry[0].resource.identifier[0].type.coding[0].code',
      resourceType: 'Bundle',
      details: terminologyDetails,
    });
    const child = issue({
      ...parent,
      id: 'child-inactive-code',
      path:
        'Bundle.entry[0].resource/*Practitioner/practitioner-1*/.identifier[0].type.coding[0].code',
      resourceType: 'Practitioner',
    });

    expect(dedupeIssues([parent, child])).toEqual([child]);
  });

  it('keeps equivalent findings from different Bundle entries distinct', () => {
    const firstEntry = issue({
      aspect: 'terminology',
      severity: 'warning',
      code: 'terminology-display-mismatch',
      message: 'Wrong Display Name Provider identifier',
      path: 'Bundle.entry[0].resource.identifier[0].type.coding[0].display',
      resourceType: 'Bundle',
      details: terminologyDetails,
    });
    const secondEntry = {
      ...firstEntry,
      id: 'second-entry',
      path: 'Bundle.entry[1].resource.identifier[0].type.coding[0].display',
    };

    expect(dedupeIssues([firstEntry, secondEntry])).toEqual([
      firstEntry,
      secondEntry,
    ]);
  });
});
