export interface FhirInputLocation {
  line: number;
  column: number;
}

export interface ParsedFhirInput {
  format: 'xml' | 'ndjson';
  resources: Array<Record<string, unknown>>;
  sourceMap: Record<string, FhirInputLocation>;
}

export interface FhirInputLimits {
  maxBytes?: number;
  maxDepth?: number;
  maxNodes?: number;
  maxRecords?: number;
  maxLineBytes?: number;
}
