import type { ValidationIssue } from '../types';
import type { StructureDefinition } from './structure-definition-types';

export interface BundleDocumentContextChildResult {
  index: number;
  entryResource: Record<string, unknown>;
  resourceType: string;
  issues: ValidationIssue[];
  structureDef?: StructureDefinition;
}
