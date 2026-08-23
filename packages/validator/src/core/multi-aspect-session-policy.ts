import { applyAdvisorRules, type AdvisorRule } from '../advisor';
import {
  applyPublicationEscalation,
  applyStrictnessSeverity,
  isForPublication,
  resolveStrictnessConfig,
} from '../strictness';
import type { ValidationIssue, ValidationSettings } from '../types';
import { normalizeIssuesByAspect } from './multi-aspect-issue-normalization';
import { createMultiAspectRunner } from './multi-aspect-runner';
import type { AspectResult, MultiAspectValidateResult } from './multi-aspect-types';
import { shouldValidateBundleEntryResources } from './single-resource-validation';
import type { StructureDefinition } from './structure-definition-types';

interface MultiAspectSessionRunnerOptions {
  collectedAspects: AspectResult[];
  fhirVersion: 'R4' | 'R5' | 'R6';
  profileUrl: string;
  throwIfStopped: () => void;
}

/** Owns settings-derived execution and result policy for one validation session. */
export class MultiAspectSessionPolicy {
  private readonly strictnessConfig: ReturnType<typeof resolveStrictnessConfig>;
  private readonly advisorRules: AdvisorRule[];
  private readonly forPublication: boolean;
  readonly validateBundleEntries: boolean;
  readonly runCustomRules: boolean;

  constructor(settings: ValidationSettings | undefined) {
    this.strictnessConfig = resolveStrictnessConfig(settings);
    this.advisorRules = settings?.advisorRules ?? [];
    this.forPublication = isForPublication(settings);
    this.validateBundleEntries = shouldValidateBundleEntryResources(settings);
    this.runCustomRules = settings?.autoApplyCustomRules !== false;
  }

  createRunner(options: MultiAspectSessionRunnerOptions): ReturnType<typeof createMultiAspectRunner> {
    return createMultiAspectRunner({
      advisorRules: this.advisorRules,
      aspectSeverityFor: this.strictnessConfig.aspectSeverityFor,
      collectedAspects: options.collectedAspects,
      fhirVersion: options.fhirVersion,
      forPublication: this.forPublication,
      profileUrl: options.profileUrl,
      strictness: this.strictnessConfig.strictness,
      throwIfStopped: options.throwIfStopped,
    });
  }

  buildResult(
    collectedAspects: AspectResult[],
    structureDef: StructureDefinition,
    profileFallbackIssue: ValidationIssue | null,
  ): MultiAspectValidateResult {
    const aspects = normalizeIssuesByAspect(collectedAspects);
    if (profileFallbackIssue) {
      const profileAspect = aspects.find(aspect => aspect.aspect === 'profile');
      if (profileAspect) profileAspect.isValid = false;
    }
    return { isValid: aspects.every(aspect => aspect.isValid), aspects, structureDef };
  }

  applyProfileIssuePolicies(issues: ValidationIssue[]): ValidationIssue[] {
    const afterStrictness = applyStrictnessSeverity(
      issues,
      this.strictnessConfig.strictness,
      this.strictnessConfig.aspectSeverityFor('profile'),
    );
    const afterAdvisor = applyAdvisorRules(afterStrictness, this.advisorRules).resultIssues;
    return applyPublicationEscalation(afterAdvisor, this.forPublication);
  }
}
