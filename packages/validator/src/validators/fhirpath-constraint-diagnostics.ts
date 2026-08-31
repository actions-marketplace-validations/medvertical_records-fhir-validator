import type { Constraint } from '../core/structure-definition-types';

export type FHIRPathConstraintSkipReason =
  | 'async-function'
  | 'disallowed-function'
  | 'unsupported-engine-capability';

export interface FHIRPathConstraintSkipSample {
  reason: FHIRPathConstraintSkipReason;
  constraintKey: string;
  profileUrl: string;
  path: string;
  expression: string;
  errorMessage: string;
}

export interface FHIRPathConstraintDiagnostics {
  skippedConstraints: {
    total: number;
    byReason: Record<FHIRPathConstraintSkipReason, number>;
    byConstraintKey: Record<string, number>;
    byProfile: Record<string, number>;
    samples: FHIRPathConstraintSkipSample[];
  };
}

const MAX_FHIRPATH_SKIP_SAMPLES = 25;

export class FHIRPathConstraintDiagnosticTracker {
  private diagnostics = createEmptyDiagnostics();

  get(): FHIRPathConstraintDiagnostics {
    return {
      skippedConstraints: {
        total: this.diagnostics.skippedConstraints.total,
        byReason: { ...this.diagnostics.skippedConstraints.byReason },
        byConstraintKey: { ...this.diagnostics.skippedConstraints.byConstraintKey },
        byProfile: { ...this.diagnostics.skippedConstraints.byProfile },
        samples: this.diagnostics.skippedConstraints.samples.map(sample => ({ ...sample })),
      },
    };
  }

  clear(): void {
    this.diagnostics = createEmptyDiagnostics();
  }

  record(
    reason: FHIRPathConstraintSkipReason,
    constraint: Constraint,
    profileUrl: string,
    path: string,
    errorMessage: string,
  ): void {
    const skipped = this.diagnostics.skippedConstraints;
    skipped.total += 1;
    skipped.byReason[reason] += 1;
    skipped.byConstraintKey[constraint.key] = (skipped.byConstraintKey[constraint.key] ?? 0) + 1;
    skipped.byProfile[profileUrl] = (skipped.byProfile[profileUrl] ?? 0) + 1;

    if (skipped.samples.length >= MAX_FHIRPATH_SKIP_SAMPLES) return;
    skipped.samples.push({
      reason,
      constraintKey: constraint.key,
      profileUrl,
      path,
      expression: constraint.expression ?? '',
      errorMessage,
    });
  }
}

export function classifyUnsupportedEngineCapabilityError(
  message: string,
): FHIRPathConstraintSkipReason | null {
  if (message.includes('asynchronous function')) return 'async-function';
  if (message.includes('is not allowed')) return 'disallowed-function';
  return null;
}

function createEmptyDiagnostics(): FHIRPathConstraintDiagnostics {
  return {
    skippedConstraints: {
      total: 0,
      byReason: {
        'async-function': 0,
        'disallowed-function': 0,
        'unsupported-engine-capability': 0,
      },
      byConstraintKey: {},
      byProfile: {},
      samples: [],
    },
  };
}
