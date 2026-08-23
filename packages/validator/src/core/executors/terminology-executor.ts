/** Public facade for terminology resolution configuration and validation execution. */

import type { ValidationIssue } from '../../types';
import type { FHIRPathTerminologyResolver } from '../../validators/fhirpath-async-terminology';
import { ValueSetCache } from '../../validators/valueset-cache';
import { ValueSetValidator, type TerminologyResolutionConfig } from '../../validators/valueset-validator';
import { logger } from '../../logger';
import type { TerminologyValidationPort } from './terminology-validation-port';
import {
  TerminologyValidationPipeline,
  type TerminologyValidationContext,
} from './terminology-validation-pipeline';

export type { TerminologyValidationContext } from './terminology-validation-pipeline';

export class TerminologyExecutor {
  private readonly valuesetValidator: TerminologyValidationPort;
  private readonly validationPipeline: TerminologyValidationPipeline;

  constructor(
    valuesetValidator?: TerminologyValidationPort,
    valueSetCache: ValueSetCache = new ValueSetCache(),
  ) {
    this.valuesetValidator = valuesetValidator ?? new ValueSetValidator(valueSetCache);
    this.validationPipeline = new TerminologyValidationPipeline(
      this.valuesetValidator,
      valueSetCache,
    );
  }

  configureResolution(config: Partial<TerminologyResolutionConfig>): void {
    this.valuesetValidator.setResolutionConfig(config);
    logger.debug(`[TerminologyExecutor] Resolution configured: strategy=${config.strategy}`);
  }

  getResolutionConfig(): TerminologyResolutionConfig {
    return this.valuesetValidator.getResolutionConfig();
  }

  getFHIRPathTerminologyResolver(): FHIRPathTerminologyResolver {
    return this.valuesetValidator;
  }

  clearCache(): void {
    this.valuesetValidator.clearCache();
    this.validationPipeline.clearCache();
    logger.info('[TerminologyExecutor] Cache cleared');
  }

  validate(context: TerminologyValidationContext): Promise<ValidationIssue[]> {
    return this.validationPipeline.validate(context);
  }
}
