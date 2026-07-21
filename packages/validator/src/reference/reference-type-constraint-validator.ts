import { extractResourceType as _extractResourceType, parseReference, type ReferenceParseResult } from './reference-type-extractor';

export interface ReferenceTypeConstraint {
  targetTypes: string[];
  targetProfiles?: string[];
  requireType?: boolean;
  fieldPath: string;
  required?: boolean;
}

export interface ReferenceTypeValidationResult {
  isValid: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code?: string;
  expectedTypes?: string[];
  actualType?: string | null;
  parseResult?: ReferenceParseResult;
}

export const REFERENCE_TYPE_CONSTRAINTS: Record<string, Record<string, ReferenceTypeConstraint>> = {
  Patient: {
    'generalPractitioner': {
      fieldPath: 'generalPractitioner',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Organization'],
      required: false,
    },
    'managingOrganization': {
      fieldPath: 'managingOrganization',
      targetTypes: ['Organization'],
      required: false,
    },
    'link.other': {
      fieldPath: 'link.other',
      targetTypes: ['Patient', 'RelatedPerson'],
      required: false,
    },
  },
  
  Observation: {
    'subject': {
      fieldPath: 'subject',
      targetTypes: ['Patient', 'Group', 'Device', 'Location'],
      required: false,
    },
    'encounter': {
      fieldPath: 'encounter',
      targetTypes: ['Encounter'],
      required: false,
    },
    'performer': {
      fieldPath: 'performer',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Organization', 'CareTeam', 'Patient', 'RelatedPerson'],
      required: false,
    },
    'specimen': {
      fieldPath: 'specimen',
      targetTypes: ['Specimen'],
      required: false,
    },
    'device': {
      fieldPath: 'device',
      targetTypes: ['Device', 'DeviceMetric'],
      required: false,
    },
    'hasMember': {
      fieldPath: 'hasMember',
      targetTypes: ['Observation', 'QuestionnaireResponse', 'MolecularSequence'],
      required: false,
    },
    'derivedFrom': {
      fieldPath: 'derivedFrom',
      targetTypes: ['DocumentReference', 'ImagingStudy', 'Media', 'QuestionnaireResponse', 'Observation', 'MolecularSequence'],
      required: false,
    },
    'focus': {
      fieldPath: 'focus',
      targetTypes: ['Resource'],
      required: false,
    },
  },
  
  Condition: {
    'subject': {
      fieldPath: 'subject',
      targetTypes: ['Patient', 'Group'],
      required: true,
    },
    'encounter': {
      fieldPath: 'encounter',
      targetTypes: ['Encounter'],
      required: false,
    },
    'recorder': {
      fieldPath: 'recorder',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Patient', 'RelatedPerson'],
      required: false,
    },
    'asserter': {
      fieldPath: 'asserter',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Patient', 'RelatedPerson'],
      required: false,
    },
    'stage.assessment': {
      fieldPath: 'stage.assessment',
      targetTypes: ['ClinicalImpression', 'DiagnosticReport', 'Observation'],
      required: false,
    },
    'evidence.detail': {
      fieldPath: 'evidence.detail',
      targetTypes: ['Resource'],
      required: false,
    },
  },
  
  Encounter: {
    'subject': {
      fieldPath: 'subject',
      targetTypes: ['Patient', 'Group'],
      required: false,
    },
    'episodeOfCare': {
      fieldPath: 'episodeOfCare',
      targetTypes: ['EpisodeOfCare'],
      required: false,
    },
    'basedOn': {
      fieldPath: 'basedOn',
      targetTypes: ['ServiceRequest'],
      required: false,
    },
    'participant.individual': {
      fieldPath: 'participant.individual',
      targetTypes: ['Practitioner', 'PractitionerRole', 'RelatedPerson'],
      required: false,
    },
    'appointment': {
      fieldPath: 'appointment',
      targetTypes: ['Appointment'],
      required: false,
    },
    'reasonReference': {
      fieldPath: 'reasonReference',
      targetTypes: ['Condition', 'Procedure', 'Observation', 'ImmunizationRecommendation'],
      required: false,
    },
    'account': {
      fieldPath: 'account',
      targetTypes: ['Account'],
      required: false,
    },
    'serviceProvider': {
      fieldPath: 'serviceProvider',
      targetTypes: ['Organization'],
      required: false,
    },
    'partOf': {
      fieldPath: 'partOf',
      targetTypes: ['Encounter'],
      required: false,
    },
  },
  
  DiagnosticReport: {
    'subject': {
      fieldPath: 'subject',
      targetTypes: ['Patient', 'Group', 'Device', 'Location'],
      required: false,
    },
    'encounter': {
      fieldPath: 'encounter',
      targetTypes: ['Encounter'],
      required: false,
    },
    'performer': {
      fieldPath: 'performer',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Organization', 'CareTeam'],
      required: false,
    },
    'resultsInterpreter': {
      fieldPath: 'resultsInterpreter',
      targetTypes: ['Practitioner', 'PractitionerRole', 'Organization', 'CareTeam'],
      required: false,
    },
    'specimen': {
      fieldPath: 'specimen',
      targetTypes: ['Specimen'],
      required: false,
    },
    'result': {
      fieldPath: 'result',
      targetTypes: ['Observation'],
      required: false,
    },
    'imagingStudy': {
      fieldPath: 'imagingStudy',
      targetTypes: ['ImagingStudy'],
      required: false,
    },
    'media.link': {
      fieldPath: 'media.link',
      targetTypes: ['Media'],
      required: false,
    },
  },
};

export class ReferenceTypeConstraintValidator {
  private constraints: Record<string, Record<string, ReferenceTypeConstraint>>;

  constructor(customConstraints?: Record<string, Record<string, ReferenceTypeConstraint>>) {
    this.constraints = customConstraints || REFERENCE_TYPE_CONSTRAINTS;
  }

  validateReferenceType(
    reference: string,
    resourceType: string,
    fieldPath: string
  ): ReferenceTypeValidationResult {
    const resourceConstraints = this.constraints[resourceType];
    if (!resourceConstraints) {
      return {
        isValid: true,
        message: `No type constraints defined for ${resourceType}`,
        severity: 'info',
      };
    }

    const fieldConstraints = resourceConstraints[fieldPath];
    if (!fieldConstraints) {
      return {
        isValid: true,
        message: `No type constraints defined for ${resourceType}.${fieldPath}`,
        severity: 'info',
      };
    }

    const parseResult = parseReference(reference);
    
    if (!parseResult.isValid) {
      return {
        isValid: false,
        message: `Invalid reference format: ${reference}`,
        severity: 'error',
        code: 'invalid-reference-format',
        parseResult,
      };
    }

    if (parseResult.referenceType === 'contained') {
      return {
        isValid: true,
        message: 'Contained reference - type validation requires resource resolution',
        severity: 'info',
        code: 'contained-reference-type-unknown',
        parseResult,
      };
    }

    const actualType = parseResult.resourceType;
    if (!actualType) {
      if (parseResult.referenceType === 'absolute') {
        return {
          isValid: true,
          message: `Absolute reference target type cannot be inferred for ${resourceType}.${fieldPath}`,
          severity: 'info',
          code: 'absolute-reference-type-unknown',
          parseResult,
        };
      }

      return {
        isValid: false,
        message: `Could not extract resource type from reference: ${reference}`,
        severity: 'warning',
        code: 'unknown-reference-type',
        parseResult,
      };
    }

    const isTypeAllowed = fieldConstraints.targetTypes.includes(actualType) ||
                          fieldConstraints.targetTypes.includes('Resource');

    if (!isTypeAllowed) {
      return {
        isValid: false,
        message: `Reference type '${actualType}' not allowed for ${resourceType}.${fieldPath}. Expected: ${fieldConstraints.targetTypes.join(', ')}`,
        severity: 'error',
        code: 'reference-type-mismatch',
        expectedTypes: fieldConstraints.targetTypes,
        actualType,
        parseResult,
      };
    }

    return {
      isValid: true,
      message: `Reference type '${actualType}' is valid for ${resourceType}.${fieldPath}`,
      severity: 'info',
      expectedTypes: fieldConstraints.targetTypes,
      actualType,
      parseResult,
    };
  }

  validateReferenceObject(
    referenceObject: { reference: string; type?: string; display?: string },
    resourceType: string,
    fieldPath: string
  ): ReferenceTypeValidationResult {
    const { reference, type: declaredType } = referenceObject;

    const referenceValidation = this.validateReferenceType(reference, resourceType, fieldPath);
    
    if (!referenceValidation.isValid) {
      return referenceValidation;
    }

    if (declaredType && referenceValidation.actualType) {
      if (declaredType !== referenceValidation.actualType) {
        return {
          isValid: false,
          message: `Reference.type '${declaredType}' does not match extracted type '${referenceValidation.actualType}' from reference '${reference}'`,
          severity: 'error',
          code: 'reference-type-mismatch',
          expectedTypes: [declaredType],
          actualType: referenceValidation.actualType,
          parseResult: referenceValidation.parseResult,
        };
      }
    }

    return referenceValidation;
  }

  getConstraintsForField(resourceType: string, fieldPath: string): ReferenceTypeConstraint | null {
    return this.constraints[resourceType]?.[fieldPath] || null;
  }

  hasConstraints(resourceType: string, fieldPath: string): boolean {
    return !!this.constraints[resourceType]?.[fieldPath];
  }

  getConstrainedFields(resourceType: string): string[] {
    const resourceConstraints = this.constraints[resourceType];
    return resourceConstraints ? Object.keys(resourceConstraints) : [];
  }

  setConstraints(resourceType: string, fieldPath: string, constraints: ReferenceTypeConstraint): void {
    if (!this.constraints[resourceType]) {
      this.constraints[resourceType] = {};
    }
    this.constraints[resourceType][fieldPath] = constraints;
  }

  validateMultipleReferences(
    references: Array<{ reference: string; fieldPath: string }>,
    resourceType: string
  ): ReferenceTypeValidationResult[] {
    return references.map(({ reference, fieldPath }) =>
      this.validateReferenceType(reference, resourceType, fieldPath)
    );
  }
}

let validatorInstance: ReferenceTypeConstraintValidator | null = null;

export function getReferenceTypeConstraintValidator(): ReferenceTypeConstraintValidator {
  if (!validatorInstance) {
    validatorInstance = new ReferenceTypeConstraintValidator();
  }
  return validatorInstance;
}

export function resetReferenceTypeConstraintValidator(): void {
  validatorInstance = null;
}
