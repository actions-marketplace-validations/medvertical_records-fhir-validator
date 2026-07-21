import { parseReference } from './reference-type-extractor';
import type {
  VersionedReferenceInfo,
  VersionIntegrityCheckResult,
  VersionConsistencyCheckResult,
  VersionAvailabilityCheckResult,
} from './version-specific-reference-types';

export type {
  VersionedReferenceInfo,
  VersionIntegrityCheckResult,
  VersionConsistencyCheckResult,
  VersionAvailabilityCheckResult,
} from './version-specific-reference-types';

export class VersionSpecificReferenceValidator {
  private versionedReferencePattern = /^(.+)\/_history\/([^\/]+)$/;
  private versionIdPattern = /^[0-9]+$/;

  parseVersionedReference(reference: string): VersionedReferenceInfo {
    const trimmed = reference.trim();
    
    if (trimmed.includes('|')) {
      const [baseUrl, version] = trimmed.split('|');
      const parseResult = parseReference(baseUrl);
      
      return {
        reference: trimmed,
        resourceType: parseResult.resourceType ?? undefined,
        resourceId: parseResult.resourceId ?? undefined,
        versionId: version,
        isVersioned: true,
        isValidVersionFormat: true,
      };
    }

    const historyMatch = trimmed.match(this.versionedReferencePattern);
    
    if (historyMatch) {
      const baseRef = historyMatch[1];
      const versionId = historyMatch[2];
      const baseParseResult = parseReference(baseRef);
      
      return {
        reference: trimmed,
        resourceType: baseParseResult.resourceType ?? undefined,
        resourceId: baseParseResult.resourceId ?? undefined,
        versionId,
        isVersioned: true,
        isValidVersionFormat: this.isValidVersionId(versionId),
      };
    }

    const parseResult = parseReference(trimmed);
    return {
      reference: trimmed,
      resourceType: parseResult.resourceType ?? undefined,
      resourceId: parseResult.resourceId ?? undefined,
      isVersioned: false,
      isValidVersionFormat: false,
    };
  }

  validateVersionedReference(reference: string): VersionIntegrityCheckResult {
    const versionInfo = this.parseVersionedReference(reference);

    if (!versionInfo.isVersioned) {
      return {
        isValid: true,
        severity: 'info',
        message: 'Reference is not versioned',
        versionInfo,
      };
    }

    if (!versionInfo.isValidVersionFormat) {
      return {
        isValid: false,
        severity: 'error',
        message: `Invalid version format: '${versionInfo.versionId}'`,
        versionInfo,
        details: {
          expectedFormat: 'Numeric version ID for _history references',
        },
      };
    }

    if (!versionInfo.resourceType || !versionInfo.resourceId) {
      return {
        isValid: false,
        severity: 'error',
        message: 'Versioned reference missing resource type or ID',
        versionInfo,
      };
    }

    return {
      isValid: true,
      severity: 'info',
      message: `Valid versioned reference: ${versionInfo.resourceType}/${versionInfo.resourceId}/_history/${versionInfo.versionId}`,
      versionInfo,
    };
  }

  checkVersionConsistency(references: string[]): VersionConsistencyCheckResult {
    const issues: VersionConsistencyCheckResult['issues'] = [];
    const referenceMap = new Map<string, VersionedReferenceInfo[]>();

    references.forEach(ref => {
      const versionInfo = this.parseVersionedReference(ref);
      if (versionInfo.resourceType && versionInfo.resourceId) {
        const key = `${versionInfo.resourceType}/${versionInfo.resourceId}`;
        if (!referenceMap.has(key)) {
          referenceMap.set(key, []);
        }
        referenceMap.get(key)!.push(versionInfo);
      }
    });

    referenceMap.forEach((refInfos, resourceKey) => {
      const versioned = refInfos.filter(r => r.isVersioned);
      const nonVersioned = refInfos.filter(r => !r.isVersioned);

      if (versioned.length > 0 && nonVersioned.length > 0) {
        issues.push({
          reference1: versioned[0].reference,
          reference2: nonVersioned[0].reference,
          issue: `Resource ${resourceKey} has both versioned and non-versioned references`,
          severity: 'warning',
        });
      }

      const versionIds = new Set(versioned.map(r => r.versionId).filter(Boolean));
      if (versionIds.size > 1) {
        const versions = Array.from(versionIds);
        issues.push({
          reference1: versioned[0].reference,
          reference2: versioned[1].reference,
          issue: `Resource ${resourceKey} referenced with different versions: ${versions.join(', ')}`,
          severity: 'warning',
        });
      }
    });

    return {
      isConsistent: issues.length === 0,
      issues,
    };
  }

  async checkVersionAvailability(
    reference: string,
    httpClient?: (url: string) => Promise<{ status: number; data?: any }>
  ): Promise<VersionAvailabilityCheckResult> {
    const versionInfo = this.parseVersionedReference(reference);

    if (!versionInfo.isVersioned) {
      return {
        isAvailable: false,
        errorMessage: 'Reference is not versioned',
      };
    }

    if (!httpClient) {
      return {
        isAvailable: false,
        errorMessage: 'No HTTP client provided for availability check',
      };
    }

    try {
      const url = `${versionInfo.resourceType}/${versionInfo.resourceId}/_history/${versionInfo.versionId}`;
      
      const response = await httpClient(url);

      if (response.status === 200) {
        const actualVersion = response.data?.meta?.versionId;
        
        if (actualVersion && actualVersion !== versionInfo.versionId) {
          return {
            isAvailable: true,
            httpStatus: response.status,
            actualVersion,
            errorMessage: `Version mismatch: requested ${versionInfo.versionId}, received ${actualVersion}`,
          };
        }

        return {
          isAvailable: true,
          httpStatus: response.status,
          actualVersion,
        };
      } else if (response.status === 404) {
        return {
          isAvailable: false,
          httpStatus: response.status,
          errorMessage: `Version ${versionInfo.versionId} not found`,
        };
      } else {
        return {
          isAvailable: false,
          httpStatus: response.status,
          errorMessage: `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      return {
        isAvailable: false,
        errorMessage: `Error checking availability: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  extractVersionedReferences(resource: any): VersionedReferenceInfo[] {
    const versionedRefs: VersionedReferenceInfo[] = [];

    const extractFromObject = (obj: any) => {
      if (!obj || typeof obj !== 'object') {
        return;
      }

      if (obj.reference && typeof obj.reference === 'string') {
        const versionInfo = this.parseVersionedReference(obj.reference);
        if (versionInfo.isVersioned) {
          versionedRefs.push(versionInfo);
        }
      }

      for (const value of Object.values(obj)) {
        if (Array.isArray(value)) {
          value.forEach(item => extractFromObject(item));
        } else if (value && typeof value === 'object') {
          extractFromObject(value);
        }
      }
    };

    extractFromObject(resource);
    return versionedRefs;
  }

  validateResourceVersionedReferences(resource: any): VersionIntegrityCheckResult[] {
    const versionedRefs = this.extractVersionedReferences(resource);
    return versionedRefs.map(versionInfo => 
      this.validateVersionedReference(versionInfo.reference)
    );
  }

  private isValidVersionId(versionId: string): boolean {
    return this.versionIdPattern.test(versionId);
  }

  compareVersions(version1: string, version2: string): number {
    const v1 = parseInt(version1, 10);
    const v2 = parseInt(version2, 10);

    if (isNaN(v1) || isNaN(v2)) {
      return version1.localeCompare(version2);
    }

    return v1 - v2;
  }

  getLatestVersion(references: string[]): VersionedReferenceInfo | null {
    const versionedRefs = references
      .map(ref => this.parseVersionedReference(ref))
      .filter(info => info.isVersioned && info.versionId);

    if (versionedRefs.length === 0) {
      return null;
    }

    return versionedRefs.reduce((latest, current) => {
      if (!latest.versionId || !current.versionId) {
        return latest;
      }
      return this.compareVersions(current.versionId, latest.versionId) > 0 ? current : latest;
    });
  }

  isLatestVersion(reference: string, allReferences: string[]): boolean {
    const versionInfo = this.parseVersionedReference(reference);
    if (!versionInfo.isVersioned || !versionInfo.versionId) {
      return false;
    }

    const latest = this.getLatestVersion(allReferences);
    if (!latest || !latest.versionId) {
      return false;
    }

    return versionInfo.versionId === latest.versionId;
  }

  toVersionedReference(reference: string, versionId: string): string {
    const parseResult = parseReference(reference);
    
    if (reference.startsWith('http://') || reference.startsWith('https://')) {
      const isCanonical = /\/(StructureDefinition|ValueSet|CodeSystem|ConceptMap|SearchParameter|CapabilityStatement|OperationDefinition|NamingSystem|ImplementationGuide|Questionnaire|PlanDefinition|Measure|Library|ActivityDefinition|MessageDefinition|CompartmentDefinition|GraphDefinition|ExampleScenario|ObservationDefinition|SpecimenDefinition)\//.test(reference);
      
      if (isCanonical) {
        const [base] = reference.split('|');
        return `${base}|${versionId}`;
      } else {
        const baseUrl = reference.split('?')[0];
        return `${baseUrl}/_history/${versionId}`;
      }
    }
    
    if (parseResult.referenceType === 'relative' && parseResult.resourceType && parseResult.resourceId) {
      return `${parseResult.resourceType}/${parseResult.resourceId}/_history/${versionId}`;
    }

    return reference;
  }

  stripVersion(reference: string): string {
    const versionInfo = this.parseVersionedReference(reference);
    
    if (!versionInfo.isVersioned) {
      return reference;
    }

    if (versionInfo.resourceType && versionInfo.resourceId) {
      return `${versionInfo.resourceType}/${versionInfo.resourceId}`;
    }

    return reference.replace(this.versionedReferencePattern, '$1');
  }

  validateBundleVersionIntegrity(bundle: any): {
    isValid: boolean;
    issues: VersionIntegrityCheckResult[];
    consistencyCheck: VersionConsistencyCheckResult;
  } {
    const issues: VersionIntegrityCheckResult[] = [];
    const allReferences: string[] = [];

    if (bundle.entry && Array.isArray(bundle.entry)) {
      bundle.entry.forEach((entry: any) => {
        if (entry.resource) {
          const versionedRefs = this.extractVersionedReferences(entry.resource);
          versionedRefs.forEach(versionInfo => {
            allReferences.push(versionInfo.reference);
            const validationResult = this.validateVersionedReference(versionInfo.reference);
            if (!validationResult.isValid) {
              issues.push(validationResult);
            }
          });
        }
      });
    }

    const consistencyCheck = this.checkVersionConsistency(allReferences);

    return {
      isValid: issues.length === 0 && consistencyCheck.isConsistent,
      issues,
      consistencyCheck,
    };
  }
}

let validatorInstance: VersionSpecificReferenceValidator | null = null;

export function getVersionSpecificReferenceValidator(): VersionSpecificReferenceValidator {
  if (!validatorInstance) {
    validatorInstance = new VersionSpecificReferenceValidator();
  }
  return validatorInstance;
}

export function resetVersionSpecificReferenceValidator(): void {
  validatorInstance = null;
}
