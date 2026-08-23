import type { ProfileSourceContext } from '../persistence';
import type { ValidationIssue, ValidationSettings } from '../types';
import { validateBestPractices } from '../validators/best-practice-validator';
import { containedResourceValidator } from '../validators/contained-resource-validator';
import { deepBindingValidator } from '../validators/deep-binding-validator';
import { deepProfileValidator } from '../validators/deep-profile-validator';
import type { ReferenceTargetValidator } from '../validators/reference-target-validator';
import { universalConstraintsValidator } from '../validators/universal-constraints-validator';
import type { SDFHIRPathExecutor } from '../validators/sd-fhirpath-executor';
import { validateReferenceTargetProfileConformance } from './multi-aspect-target-profile-conformance';
import type { MultiAspectDeps } from './multi-aspect-dependencies';
import type { MultiAspectResourceContext } from './multi-aspect-resource-preparation';
import type { AspectResult, ValidateOneFn } from './multi-aspect-types';
import type { createMultiAspectRunner } from './multi-aspect-runner';
import { getValueAtPath } from './validation-utils';

interface ExecuteSelectedAspectsOptions {
  deps: MultiAspectDeps;
  selectedAspects: ReadonlySet<string>;
  settings?: ValidationSettings;
  organizationId?: number;
  profileSourceContext: ProfileSourceContext;
  profileFallbackIssue: ValidationIssue | null;
  runCustomRules: boolean;
  context: MultiAspectResourceContext;
  collectedAspects: AspectResult[];
  runAspect: ReturnType<typeof createMultiAspectRunner>;
  validateOne: ValidateOneFn;
  targetProfileValidator: ReferenceTargetValidator;
  recursionDepth: number;
  skipTargetProfileConformance?: boolean;
  containingResource?: Record<string, unknown>;
  throwIfStopped: () => void;
  sdFHIRPathExecutor: SDFHIRPathExecutor;
}

export async function executeSelectedAspects(options: ExecuteSelectedAspectsOptions): Promise<void> {
  const { context: ctx, deps, selectedAspects, runAspect } = options;
  if (selectedAspects.has('structural')) {
    await runAspect('structural', async () => [
      ...await deps.structuralExecutor.validate(ctx.resource, { ...ctx, getValueAtPath }),
      ...validateBestPractices(deps.bestPracticeValidator, {
        resource: ctx.resource,
        resourceType: ctx.resourceType,
        profileUrl: ctx.profileUrl,
      }, options.settings),
    ]);
  }

  const needsInvariantContext = selectedAspects.has('invariant');
  const preInvariantAspects: Promise<void>[] = [];
  const parallelAspects: Promise<void>[] = [];
  const schedule = (promise: Promise<void>, contributesToInvariantContext = false) => {
    (needsInvariantContext && contributesToInvariantContext ? preInvariantAspects : parallelAspects).push(promise);
  };

  if (selectedAspects.has('profile')) {
    schedule(runAspect('profile', async () => {
      const profileIssues = await deps.profileExecutor.validate({ ...ctx, getValueAtPath });
      const deepProfileIssues = deepProfileValidator.validate({
        resource: ctx.resource,
        resourceType: ctx.resourceType,
        structureDef: ctx.structureDef,
        profileUrl: ctx.profileUrl,
      });
      const fhirPathIssues = await options.sdFHIRPathExecutor.execute({
        resource: ctx.resource,
        resourceType: ctx.resourceType,
        structureDef: ctx.structureDef,
        bundle: ctx.enclosingBundle ?? (ctx.resourceType === 'Bundle' ? ctx.resource : undefined),
        fhirVersion: ctx.fhirVersion,
        terminologyResolver: deps.terminologyExecutor.getFHIRPathTerminologyResolver?.(),
      });
      return [
        ...(options.profileFallbackIssue ? [options.profileFallbackIssue] : []),
        ...profileIssues,
        ...deepProfileIssues,
        ...fhirPathIssues,
      ];
    }), true);
  } else if (options.profileFallbackIssue) {
    schedule(runAspect('profile', async () => [options.profileFallbackIssue as ValidationIssue]));
  }

  if (selectedAspects.has('terminology')) {
    schedule(runAspect('terminology', async () => [
      ...await deps.terminologyExecutor.validate({
        resource: ctx.resource,
        structureDef: ctx.structureDef,
        getValueAtPath,
        fhirVersion: ctx.fhirVersion,
        sourceContext: options.profileSourceContext,
      }),
      ...deepBindingValidator.validate({
        resource: ctx.resource,
        resourceType: ctx.resourceType,
        structureDef: ctx.structureDef,
      }),
    ]), true);
  }

  if (preInvariantAspects.length > 0) {
    await Promise.all(preInvariantAspects);
    options.throwIfStopped();
  }
  scheduleParallelAspects(options, parallelAspects);
  if (parallelAspects.length > 0) {
    await Promise.all(parallelAspects);
    options.throwIfStopped();
  }
}

function scheduleParallelAspects(
  options: ExecuteSelectedAspectsOptions,
  parallelAspects: Promise<void>[],
): void {
  const { context: ctx, deps, selectedAspects, runAspect } = options;
  if (selectedAspects.has('reference')) {
    parallelAspects.push(runAspect('reference', async () => {
      const referenceIssues = await deps.referenceExecutor.validate({
        resource: ctx.resource,
        fhirVersion: ctx.fhirVersion,
        settings: options.settings,
      });
      const wantsTargetProfiles = !options.skipTargetProfileConformance
        && options.settings?.recursiveReferenceValidation?.validateTargetProfiles === true
        && Boolean(ctx.referenceResolver);
      if (!wantsTargetProfiles) return referenceIssues;

      const conformanceIssues = await validateReferenceTargetProfileConformance({
        resource: ctx.resource,
        structureDef: ctx.structureDef,
        referenceTargetValidator: options.targetProfileValidator,
        resolveReference: ctx.referenceResolver ?? undefined,
        validateProfile: async (target, profile) => {
          const result = await options.validateOne(
            target,
            profile,
            ctx.fhirVersion,
            options.recursionDepth + 1,
            ctx.enclosingBundle,
            true,
            options.containingResource ?? ctx.resource,
          );
          return result.aspects.flatMap(aspect => aspect.issues);
        },
      });
      return [...referenceIssues, ...conformanceIssues];
    }));
  }

  if (selectedAspects.has('invariant')) {
    parallelAspects.push(runAspect('invariant', async () => [
      ...await deps.invariantExecutor.validate({
        resource: ctx.resource,
        structureDef: ctx.structureDef,
        profileUrl: ctx.profileUrl,
        existingIssues: options.collectedAspects.flatMap(aspect => aspect.issues),
      }),
      ...containedResourceValidator.validate(ctx.resource),
      ...universalConstraintsValidator.validate(ctx.resource),
      ...deps.terminologyResourceValidator.validate(ctx.resource, ctx.fhirVersion),
    ]));
  }

  if (selectedAspects.has('custom_rule') && options.runCustomRules) {
    parallelAspects.push(runAspect('custom_rule', () => deps.customRuleExecutor.validate({
      resource: ctx.resource,
      structureDef: ctx.structureDef,
      fhirVersion: ctx.fhirVersion,
      organizationId: options.organizationId,
    })));
  }
  if (selectedAspects.has('metadata')) {
    parallelAspects.push(runAspect(
      'metadata',
      () => deps.metadataExecutor.validate({ resource: ctx.resource }, ctx.profileUrl),
    ));
  }
}
