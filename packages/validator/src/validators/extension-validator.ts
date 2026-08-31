import type { ValidationIssue } from '../types';
import { createValidationIssue } from '../issues';
import { resourceTypeOf } from '../core/fhir-resource';
import type { StructureDefinition } from '../core/structure-definition-types';
import type { StructureDefinitionLoader } from '../core/structure-definition-loader';
import { logger } from '../logger';
import type { TypeValidator } from './type-validator';
import type { ValueSetValidator } from './valueset-validator';
import type { ElementRulesValidator } from './element-rules-validator';
import type { ExtensionValidationContext } from './extension-types';
import {
  createSafeValidationFailureMessage,
  validationFailureMetadata,
} from '../utils/validation-execution-failure';
import { SDFHIRPathExecutor } from './sd-fhirpath-executor';
import { ExtensionValidationRuntime } from './extension-validation-runtime';

export type { ExtensionDefinition, ExtensionValidationContext } from './extension-types';

export class ExtensionValidator {
  private readonly runtime: ExtensionValidationRuntime;

  constructor(
    sdLoader: StructureDefinitionLoader,
    typeValidator: TypeValidator,
    valueSetValidator: ValueSetValidator,
    elementRulesValidator: ElementRulesValidator,
    sdFHIRPathExecutor: SDFHIRPathExecutor = new SDFHIRPathExecutor(),
  ) {
    this.runtime = new ExtensionValidationRuntime({
      sdLoader,
      typeValidator,
      valueSetValidator,
      elementRulesValidator,
      sdFHIRPathExecutor,
    });
  }

  async validateExtensions(
    resource: unknown,
    profileSD: StructureDefinition,
    context: ExtensionValidationContext
  ): Promise<ValidationIssue[]> {
    const result = await this.runtime.validate(resource, profileSD, context);
    if (result.status === 'completed') return result.issues;

    logger.error(
      '[ExtensionValidator] Extension validation failed',
      validationFailureMetadata(result.error),
    );
    result.issues.push(createValidationIssue({
      code: 'profile-extension-validation-error',
      path: 'extension',
      resourceType: resourceTypeOf(resource, 'Unknown'),
      customMessage: createSafeValidationFailureMessage('Extension validation'),
    }));
    return result.issues;
  }
}
