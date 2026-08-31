import type { ValidationIssue, ValidationSettings } from '../types';
import { ReferenceTargetValidator } from '../validators/reference-target-validator';
import type { ReferenceResolver } from '../validators/slicing-validator';
import { BatchValidationAbortedError } from './batch-validator';
import {
  applyCodeInferredAttributionToAspectResults,
  resolveCodeInferredProfileMatch,
} from './code-inferred-profile-attribution';
import {
  applyDeclaredProfileAttributionToAspectResults,
  resolveDeclaredProfileSubstitution,
} from './declared-profile-attribution';
import { appendBundleEntryValidationResults } from './multi-aspect-bundle-entry-validation';
import { appendContainedResourceValidationResults } from './multi-aspect-contained-validation';
import { appendParametersResourceValidationResults } from './multi-aspect-parameters-validation';
import type { MultiAspectDeps } from './multi-aspect-dependencies';
import { executeSelectedAspects } from './multi-aspect-aspect-execution';
import {
  MultiAspectResourcePreparation,
  type MultiAspectResourceContext,
} from './multi-aspect-resource-preparation';
import type { AspectResult, MultiAspectValidateResult, ValidateOneFn } from './multi-aspect-types';
import type { StructureDefinition } from './structure-definition-types';
import { SDFHIRPathExecutor } from '../validators/sd-fhirpath-executor';
import { MultiAspectSessionPolicy } from './multi-aspect-session-policy';

const EMBEDDED_RESOURCE_MAX_DEPTH = 3;

interface MultiAspectValidationSessionOptions {
  deps: MultiAspectDeps;
  aspects: string[];
  settings: unknown;
  organizationId?: number;
  shouldStop?: () => boolean;
  onEmbeddedResourceValidated?: (
    resource: Record<string, unknown>,
    result: MultiAspectValidateResult,
  ) => void | Promise<void>;
  externalReferenceResolver?: ReferenceResolver;
  serverId?: number;
}

export class MultiAspectValidationSession {
  private readonly typedSettings: ValidationSettings | undefined;
  private readonly selectedAspects: ReadonlySet<string>;
  private readonly policy: MultiAspectSessionPolicy;
  private readonly targetProfileValidator = new ReferenceTargetValidator();
  private readonly sdFHIRPathExecutor: SDFHIRPathExecutor;
  private readonly resourcePreparation: MultiAspectResourcePreparation;

  constructor(private readonly options: MultiAspectValidationSessionOptions) {
    this.typedSettings = options.settings as ValidationSettings | undefined;
    this.selectedAspects = new Set(options.aspects);
    this.policy = new MultiAspectSessionPolicy(this.typedSettings);
    this.sdFHIRPathExecutor = options.deps.sdFHIRPathExecutor ?? new SDFHIRPathExecutor();
    this.resourcePreparation = new MultiAspectResourcePreparation({
      deps: options.deps,
      settings: options.settings,
      organizationId: options.organizationId,
      serverId: options.serverId,
      externalReferenceResolver: options.externalReferenceResolver,
      throwIfStopped: () => this.throwIfStopped(),
    });
  }

  validate = (
    resource: unknown,
    profileUrl: string,
    fhirVersion: 'R4' | 'R5' | 'R6',
  ): Promise<MultiAspectValidateResult> => this.validateOne(resource, profileUrl, fhirVersion, 0);

  private validateOne: ValidateOneFn = async (
    resource,
    profileUrl,
    fhirVersion,
    recursionDepth,
    enclosingBundle,
    skipTargetProfileConformance,
    containingResource,
  ) => {
    this.throwIfStopped();
    const prepared = await this.resourcePreparation.prepare(
      resource,
      profileUrl,
      fhirVersion,
      enclosingBundle,
      containingResource,
    );
    if (prepared.kind === 'missing-profile') return prepared.result;

    const { context, profileFallbackIssue, profileSourceContext } = prepared;
    const collectedAspects: AspectResult[] = [];
    const runAspect = this.policy.createRunner({
      collectedAspects,
      fhirVersion,
      profileUrl,
      throwIfStopped: () => this.throwIfStopped(),
    });

    await executeSelectedAspects({
      deps: this.options.deps,
      selectedAspects: this.selectedAspects,
      settings: this.typedSettings,
      organizationId: this.options.organizationId,
      profileSourceContext,
      profileFallbackIssue,
      runCustomRules: this.policy.runCustomRules,
      context,
      collectedAspects,
      runAspect,
      validateOne: this.validateOne,
      targetProfileValidator: this.targetProfileValidator,
      recursionDepth,
      skipTargetProfileConformance,
      containingResource,
      throwIfStopped: () => this.throwIfStopped(),
      sdFHIRPathExecutor: this.sdFHIRPathExecutor,
    });
    this.attributeSubstitutedProfileFindings(collectedAspects, context, profileFallbackIssue);
    await this.appendEmbeddedValidation(
      context.resource,
      fhirVersion,
      recursionDepth,
      enclosingBundle,
      context.structureDef,
      collectedAspects,
    );
    return this.policy.buildResult(collectedAspects, context.structureDef, profileFallbackIssue);
  };

  /**
   * Findings produced by a silently substituted profile SD (code-inferred or
   * declared via meta.profile) must not read as base-spec claims. A fallback
   * means validation ran against the base SD after all, so the substitution
   * must not claim the findings. Runs before embedded results are appended so
   * only this resource's aspect buckets are relabeled.
   */
  private attributeSubstitutedProfileFindings(
    collectedAspects: AspectResult[],
    context: MultiAspectResourceContext,
    profileFallbackIssue: ValidationIssue | null,
  ): void {
    if (profileFallbackIssue || !this.selectedAspects.has('profile')) return;
    const codeInferredProfile = resolveCodeInferredProfileMatch(context.resource, context.profileUrl);
    if (codeInferredProfile) {
      applyCodeInferredAttributionToAspectResults(collectedAspects, codeInferredProfile, context.fhirVersion);
      return;
    }
    if (resolveDeclaredProfileSubstitution(context.resource, context.profileUrl)) {
      applyDeclaredProfileAttributionToAspectResults(
        collectedAspects,
        context.profileUrl,
        context.structureDef,
      );
    }
  }

  private async appendEmbeddedValidation(
    resource: Record<string, unknown>,
    fhirVersion: 'R4' | 'R5' | 'R6',
    recursionDepth: number,
    enclosingBundle: Record<string, unknown> | undefined,
    structureDef: StructureDefinition,
    collectedAspects: AspectResult[],
  ): Promise<void> {
    if (Array.isArray(resource.contained) && recursionDepth < EMBEDDED_RESOURCE_MAX_DEPTH) {
      await appendContainedResourceValidationResults(
        resource,
        fhirVersion,
        recursionDepth,
        this.validateOne,
        collectedAspects,
        enclosingBundle,
        this.options.shouldStop,
      );
      this.throwIfStopped();
    }
    if (resource.resourceType === 'Parameters' && recursionDepth < EMBEDDED_RESOURCE_MAX_DEPTH) {
      await appendParametersResourceValidationResults(
        resource,
        fhirVersion,
        recursionDepth,
        this.validateOne,
        collectedAspects,
        enclosingBundle,
        this.options.shouldStop,
      );
      this.throwIfStopped();
    }
    if (
      !this.policy.validateBundleEntries
      || resource.resourceType !== 'Bundle'
      || recursionDepth >= EMBEDDED_RESOURCE_MAX_DEPTH
    ) return;

    await appendBundleEntryValidationResults(
      resource,
      fhirVersion,
      recursionDepth,
      this.validateOne,
      collectedAspects,
      structureDef,
      issues => this.policy.applyProfileIssuePolicies(issues),
      this.options.shouldStop,
      this.options.onEmbeddedResourceValidated,
    );
    this.throwIfStopped();
  }

  private throwIfStopped(): void {
    if (this.options.shouldStop?.()) throw new BatchValidationAbortedError();
  }
}
