import type { ValidationIssue } from "../types";
import type { StructureDefinition } from "./structure-definition-types";
import {
  buildBundleDocumentContextIssues,
  type BundleDocumentContextChildResult,
} from "./bundle-document-context";
import type {
  AspectResult,
  MultiAspectValidateResult,
  ValidateOneFn,
} from "./multi-aspect-types";
import { BatchValidationAbortedError } from "./batch-validator";
import { logger } from "../logger";
import { getBundleEntryRequiredProfile } from "./bundle-entry-slice-definitions";
import { getDeclaredProfiles } from "./declared-profile-utils";
import { mapBundleEntryIssues } from './bundle-entry-validation-output';

const DEFAULT_BUNDLE_ENTRY_VALIDATION_CONCURRENCY = 16;
const MAX_BUNDLE_ENTRY_VALIDATION_CONCURRENCY = 64;
const LARGE_BUNDLE_ENTRY_LOG_THRESHOLD = 100;

interface BundleChildValidationResult {
  index: number;
  entryResource: Record<string, unknown>;
  resourceType: string;
  result: MultiAspectValidateResult;
}

export async function appendBundleEntryValidationResults(
  bundle: Record<string, unknown>,
  fhirVersion: "R4" | "R5" | "R6",
  recursionDepth: number,
  validateOne: ValidateOneFn,
  parentAspects: AspectResult[],
  parentStructureDef: StructureDefinition | undefined,
  transformDocumentContextIssues: (
    issues: ValidationIssue[],
  ) => ValidationIssue[],
  shouldStop?: () => boolean,
  onEntryValidated?: (
    resource: Record<string, unknown>,
    result: MultiAspectValidateResult,
  ) => void | Promise<void>,
): Promise<void> {
  throwIfStopped(shouldStop);
  const entries = Array.isArray(bundle.entry) ? bundle.entry : [];
  if (entries.length === 0) return;

  const validationTargets = entries
    .map((entry, index) => {
      const entryRecord = entry as Record<string, unknown> | undefined;
      const entryResource = entryRecord?.resource as
        Record<string, unknown> | undefined;
      if (!entryResource || typeof entryResource !== "object") return null;
      const resourceType =
        typeof entryResource.resourceType === "string"
          ? entryResource.resourceType
          : null;
      if (!resourceType) return null;

      const declared = getDeclaredProfiles(entryResource);
      const profileUrl =
        declared[0] ||
        getBundleEntryRequiredProfile(
          { entryResource, resourceType },
          parentStructureDef,
        ) ||
        `http://hl7.org/fhir/StructureDefinition/${resourceType}`;
      return { index, entryResource, resourceType, profileUrl };
    })
    .filter(
      (
        target,
      ): target is {
        index: number;
        entryResource: Record<string, unknown>;
        resourceType: string;
        profileUrl: string;
      } => target !== null,
    );

  const childResults: BundleChildValidationResult[] = [];
  const concurrency = resolveBundleEntryValidationConcurrency();
  const shouldLogLargeBundle =
    validationTargets.length >= LARGE_BUNDLE_ENTRY_LOG_THRESHOLD;
  const startTime = Date.now();

  if (shouldLogLargeBundle) {
    logger.info(
      `[RecordsValidator] Large Bundle entry validation: ${validationTargets.length} embedded resources ` +
        `(concurrency=${concurrency}, depth=${recursionDepth})`,
    );
  }

  for (let i = 0; i < validationTargets.length; i += concurrency) {
    throwIfStopped(shouldStop);
    const chunk = validationTargets.slice(i, i + concurrency);
    const chunkResults = await Promise.all(
      chunk.map(async (target) => {
        const result = await validateBundleEntryTarget(
          target,
          validateOne,
          fhirVersion,
          recursionDepth,
          bundle,
          shouldStop,
        );
        await onEntryValidated?.(target.entryResource, result);
        throwIfStopped(shouldStop);
        return {
          index: target.index,
          entryResource: target.entryResource,
          resourceType: target.resourceType,
          result,
        };
      }),
    );
    childResults.push(...chunkResults);
    throwIfStopped(shouldStop);
  }

  if (shouldLogLargeBundle) {
    logger.info(
      `[RecordsValidator] Large Bundle entry validation completed in ${Date.now() - startTime}ms ` +
        `(${validationTargets.length} embedded resources)`,
    );
  }

  childResults.sort((a, b) => a.index - b.index);
  for (const child of childResults) {
    mergeEntryAspects(
      parentAspects,
      child.result.aspects,
      child.index,
      child.entryResource,
      child.resourceType,
    );
  }

  throwIfStopped(shouldStop);
  const documentContextIssues = transformDocumentContextIssues(
    buildBundleDocumentContextIssues(
      bundle,
      childResults.map(toDocumentContextChildResult),
      parentStructureDef,
    ),
  );
  if (documentContextIssues.length > 0) {
    appendIssuesToAspect(parentAspects, "profile", documentContextIssues);
  }
}

async function validateBundleEntryTarget(
  target: {
    entryResource: Record<string, unknown>;
    profileUrl: string;
  },
  validateOne: ValidateOneFn,
  fhirVersion: "R4" | "R5" | "R6",
  recursionDepth: number,
  bundle: Record<string, unknown>,
  shouldStop?: () => boolean,
): Promise<MultiAspectValidateResult> {
  throwIfStopped(shouldStop);
  const result = await validateOne(
    target.entryResource,
    target.profileUrl,
    fhirVersion,
    recursionDepth + 1,
    bundle,
  );
  throwIfStopped(shouldStop);
  return result;
}

function throwIfStopped(shouldStop?: () => boolean): void {
  if (shouldStop?.()) {
    throw new BatchValidationAbortedError();
  }
}

function resolveBundleEntryValidationConcurrency(): number {
  const rawValue = process.env.VALIDATION_BUNDLE_ENTRY_CONCURRENCY;
  if (!rawValue) return DEFAULT_BUNDLE_ENTRY_VALIDATION_CONCURRENCY;

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_BUNDLE_ENTRY_VALIDATION_CONCURRENCY;
  }

  return Math.min(parsed, MAX_BUNDLE_ENTRY_VALIDATION_CONCURRENCY);
}

function toDocumentContextChildResult(
  child: BundleChildValidationResult,
): BundleDocumentContextChildResult {
  return {
    index: child.index,
    entryResource: child.entryResource,
    resourceType: child.resourceType,
    issues: child.result.aspects.flatMap((aspect) => aspect.issues),
    structureDef: child.result.structureDef,
  };
}

function mergeEntryAspects(
  parentAspects: AspectResult[],
  childAspects: AspectResult[],
  entryIndex: number,
  entryResource: Record<string, unknown>,
  resourceType: string,
): void {
  for (const childAspect of childAspects) {
    const context = {
      entryIndex,
      resourceType,
      resourceId:
        typeof entryResource.id === "string" ? entryResource.id : undefined,
      includeBundleUnitDetails: true,
    };
    const { parentIssues: rewrittenIssues } = mapBundleEntryIssues(
      childAspect.issues,
      context,
    );
    const { parentIssues: rewrittenEvidence } = mapBundleEntryIssues(
      childAspect.evidenceIssues ?? childAspect.issues,
      { ...context, includeSuppressed: true },
    );
    if (rewrittenIssues.length === 0 && rewrittenEvidence.length === 0)
      continue;

    let parentAspect = parentAspects.find(
      (aspect) => aspect.aspect === childAspect.aspect,
    );
    if (!parentAspect) {
      parentAspect = {
        aspect: childAspect.aspect,
        issues: [],
        evidenceIssues: [],
        validationTime: 0,
        isValid: true,
      };
      parentAspects.push(parentAspect);
    }

    parentAspect.issues.push(...rewrittenIssues);
    parentAspect.evidenceIssues?.push(...rewrittenEvidence);
    parentAspect.validationTime += childAspect.validationTime;
    parentAspect.isValid = parentAspect.issues.every(
      (issue) => issue.severity !== "error" && issue.severity !== "fatal",
    );
  }
}

function appendIssuesToAspect(
  parentAspects: AspectResult[],
  aspectName: string,
  issues: ValidationIssue[],
): void {
  if (issues.length === 0) return;
  let parentAspect = parentAspects.find(
    (aspect) => aspect.aspect === aspectName,
  );
  if (!parentAspect) {
    parentAspect = {
      aspect: aspectName,
      issues: [],
      validationTime: 0,
      isValid: true,
    };
    parentAspects.push(parentAspect);
  }

  const existing = new Set(
    parentAspect.issues.map(
      (issue) => `${issue.code}|${issue.path}|${issue.message}`,
    ),
  );
  for (const issue of issues) {
    const key = `${issue.code}|${issue.path}|${issue.message}`;
    if (existing.has(key)) continue;
    existing.add(key);
    parentAspect.issues.push(issue);
  }
  parentAspect.isValid = parentAspect.issues.every(
    (issue) => issue.severity !== "error" && issue.severity !== "fatal",
  );
}
