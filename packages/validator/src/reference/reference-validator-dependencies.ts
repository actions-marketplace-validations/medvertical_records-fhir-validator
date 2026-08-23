import { BatchedReferenceChecker } from './batched-reference-checker';
import { BundleReferenceResolver } from './bundle-reference-resolver';
import { CanonicalReferenceValidator } from './canonical-reference-validator';
import { CircularReferenceDetector } from './circular-reference-detector';
import { ContainedReferenceResolver } from './contained-reference-resolver';
import { RecursiveReferenceValidator } from './recursive-reference-validator';
import { ReferenceTypeConstraintValidator } from './reference-type-constraint-validator';
import { VersionSpecificReferenceValidator } from './version-specific-reference-validator';

export interface ReferenceValidatorDependencies {
  batchedChecker: BatchedReferenceChecker;
  bundleResolver: BundleReferenceResolver;
  canonicalValidator: CanonicalReferenceValidator;
  circularDetector: CircularReferenceDetector;
  constraintValidator: ReferenceTypeConstraintValidator;
  containedResolver: ContainedReferenceResolver;
  recursiveValidator: RecursiveReferenceValidator;
  versionValidator: VersionSpecificReferenceValidator;
}

export function createReferenceValidatorDependencies(
  overrides: Partial<ReferenceValidatorDependencies> = {},
): ReferenceValidatorDependencies {
  return {
    batchedChecker: overrides.batchedChecker ?? new BatchedReferenceChecker(),
    bundleResolver: overrides.bundleResolver ?? new BundleReferenceResolver(),
    canonicalValidator: overrides.canonicalValidator ?? new CanonicalReferenceValidator(),
    circularDetector: overrides.circularDetector ?? new CircularReferenceDetector(10),
    constraintValidator: overrides.constraintValidator ?? new ReferenceTypeConstraintValidator(),
    containedResolver: overrides.containedResolver ?? new ContainedReferenceResolver(),
    recursiveValidator: overrides.recursiveValidator ?? new RecursiveReferenceValidator(),
    versionValidator: overrides.versionValidator ?? new VersionSpecificReferenceValidator(),
  };
}
