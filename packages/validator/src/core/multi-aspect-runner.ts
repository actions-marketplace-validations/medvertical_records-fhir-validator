import { applyAdvisorRules, type AdvisorRule } from '../advisor';
import {
  applyPublicationEscalation,
  applyStrictnessSeverity,
} from '../strictness';
import type { ValidationIssue } from '../types';
import { BatchValidationAbortedError } from './batch-validator';
import { withIssuesSchemaVersion } from './issue-schema-version';
import { attachAppliedProfile } from './multi-aspect-contained-validation';
import type { AspectResult } from './multi-aspect-types';
import { createValidationErrorIssue } from './validation-utils';

interface MultiAspectRunnerOptions {
  advisorRules: AdvisorRule[];
  aspectSeverityFor: (aspect: string) => Parameters<typeof applyStrictnessSeverity>[2];
  collectedAspects: AspectResult[];
  fhirVersion: 'R4' | 'R5' | 'R6';
  forPublication: boolean;
  profileUrl: string;
  strictness: Parameters<typeof applyStrictnessSeverity>[1];
  throwIfStopped: () => void;
}

/** Apply the common stop, policy, schema, timing, and failure contract for one aspect. */
export function createMultiAspectRunner(options: MultiAspectRunnerOptions) {
  return async (name: string, validate: () => Promise<ValidationIssue[]>): Promise<void> => {
    const {
      advisorRules,
      aspectSeverityFor,
      collectedAspects,
      fhirVersion,
      forPublication,
      profileUrl,
      strictness,
      throwIfStopped,
    } = options;
    throwIfStopped();
    const aspectStart = Date.now();
    try {
      const rawIssues = (await validate()).map(issue => {
        const profiled = attachAppliedProfile(issue, profileUrl);
        return {
          ...profiled,
          rawSeverity: profiled.rawSeverity ?? profiled.severity,
          rawMessage: profiled.rawMessage ?? profiled.message,
        };
      });
      throwIfStopped();
      const afterStrictness = applyStrictnessSeverity(rawIssues, strictness, aspectSeverityFor(name));
      const governed = applyAdvisorRules(afterStrictness, advisorRules);
      throwIfStopped();
      const issues = withIssuesSchemaVersion(
        applyPublicationEscalation(governed.resultIssues, forPublication),
        fhirVersion,
      );
      const evidenceIssues = withIssuesSchemaVersion(
        applyPublicationEscalation(governed.evidenceIssues, forPublication),
        fhirVersion,
      );
      throwIfStopped();
      collectedAspects.push({
        aspect: name,
        issues,
        evidenceIssues,
        validationTime: Date.now() - aspectStart,
        isValid: issues.every(issue => issue.severity !== 'error' && issue.severity !== 'fatal'),
      });
    } catch (error: unknown) {
      if (error instanceof BatchValidationAbortedError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      collectedAspects.push({
        aspect: name,
        issues: withIssuesSchemaVersion(
          [createValidationErrorIssue(name, 'internal-error', message)],
          fhirVersion,
        ),
        validationTime: Date.now() - aspectStart,
        isValid: false,
      });
    }
  };
}
