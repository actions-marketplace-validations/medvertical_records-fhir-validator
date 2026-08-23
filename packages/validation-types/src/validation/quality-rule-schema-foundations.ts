import { z } from 'zod';

export const QUALITY_RULE_SCOPES = [
  'resource',
  'reference-graph',
  'cohort',
  'external-reference',
] as const;
export const QUALITY_RULE_OUTCOMES = ['pass', 'fail', 'not-evaluable'] as const;
export const QUALITY_NORMATIVE_STATUSES = [
  'normative',
  'informative',
  'experimental',
  'local',
] as const;
export const QUALITY_RULE_SEVERITIES = ['information', 'warning', 'error'] as const;
export const QUALITY_ADVISORY_ACTIONS = [
  'suppress',
  'override-severity',
  'override-message',
] as const;
export const QUALITY_FINDING_DISPOSITIONS = ['active', 'suppressed'] as const;

export const boundedQualityRuleId = z.string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*$/);
export const boundedQualityResourceType = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Z][A-Za-z0-9]*$/);
export const boundedQualityPath = z.string().min(1).max(512);
export const boundedQualityIssueToken = z.string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const qualityRuleSourceSchema = z.object({
  label: z.string().min(1).max(256),
  url: z.string().url().max(2_048).optional(),
  citation: z.string().max(2_048).optional(),
}).strict();
