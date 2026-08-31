/** Offline structural validation for FHIR Provenance linkage and chronology. */

import type { ValidationIssue } from '../types';
import {
  validateProvenanceAgents,
  validateProvenanceTargets,
} from './provenance-reference-checks';
import {
  validateProvenanceOccurredOrder,
  validateProvenanceRecorded,
} from './provenance-temporal-checks';
import { isProvenance } from './provenance-chain-types';

/** Returns no issues for resources other than Provenance. */
export function validateProvenanceChain(resource: unknown): ValidationIssue[] {
  if (!isProvenance(resource)) return [];
  const issues: ValidationIssue[] = [];
  validateProvenanceTargets(resource, issues);
  validateProvenanceRecorded(resource, issues);
  validateProvenanceAgents(resource, issues);
  validateProvenanceOccurredOrder(resource, issues);
  return issues;
}
