/**
 * StructureDefinition Types
 * 
 * Type definitions for StructureDefinition and related types.
 * Extracted from structure-definition-loader.ts to break circular dependencies.
 */

export interface StructureDefinition {
  [key: string]: unknown;
  resourceType: 'StructureDefinition';
  id?: string;
  url: string;
  version?: string;
  name: string;
  title?: string;
  status: string;
  kind: string;
  abstract: boolean;
  type: string;
  baseDefinition?: string;
  extension?: StructureDefinitionExtension[];
  differential?: {
    element: ElementDefinition[];
  };
  snapshot?: {
    element: ElementDefinition[];
  };
}

export interface StructureDefinitionExtension {
  url?: string;
  valueCanonical?: string;
  [key: string]: unknown;
}

export interface ElementDefinition {
  [key: string]: unknown;
  id?: string;
  path: string;
  short?: string;
  definition?: string;
  min?: number;
  max?: string;
  type?: ElementType[];
  contentReference?: string;
  constraint?: Constraint[];
  binding?: Binding;
  mustSupport?: boolean;
  isModifier?: boolean;
  sliceName?: string; // Name of the slice (if this element is part of a slice)
  slicing?: SlicingDefinition; // Slicing definition for this element
  // Additional properties used by deep-profile-validator
  maxLength?: number;
  // Fixed values (polymorphic - fixedString, fixedCode, etc.)
  [key: `fixed${string}`]: unknown;
  // Pattern values (polymorphic - patternCodeableConcept, etc.)
  [key: `pattern${string}`]: unknown;
  // Min/max values (polymorphic - minValueInteger, maxValueDecimal, etc.)
  [key: `minValue${string}`]: unknown;
  [key: `maxValue${string}`]: unknown;
}

export interface SlicingDefinition {
  discriminator?: SlicingDiscriminator[];
  rules?: 'closed' | 'open' | 'openAtEnd';
  ordered?: boolean;
  description?: string;
}

export interface SlicingDiscriminator {
  type: 'value' | 'pattern' | 'type' | 'profile' | 'exists';
  path: string;
}

export interface ElementType {
  code: string;
  profile?: string[];
  targetProfile?: string[];
}

export interface Constraint {
  key: string;
  severity: 'error' | 'warning';
  human: string;
  expression?: string; // FHIRPath expression
  xpath?: string;
  source?: string;
}

export interface Binding {
  strength: 'required' | 'extensible' | 'preferred' | 'example';
  valueSet?: string;
  description?: string;
  extension?: Array<Record<string, unknown>>;
}
