export interface ReferenceParseResult {
  resourceType: string | null;
  resourceId: string | null;
  referenceType: 'relative' | 'absolute' | 'canonical' | 'contained' | 'fragment' | 'invalid';
  isValid: boolean;
  originalReference: string;
  baseUrl?: string;
  version?: string;
  metadata?: {
    error?: string;
    isHistorical?: boolean;
    hasVersion?: boolean;
    isBundle?: boolean;
    bundleType?: string;
  };
}

export interface ReferenceTypeExtractionOptions {
  allowContained?: boolean;
  allowCanonical?: boolean;
  extractVersion?: boolean;
  validateResourceType?: boolean;
}
