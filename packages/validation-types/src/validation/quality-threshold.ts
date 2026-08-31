import { z } from 'zod';

export const qualityThresholdSchema = z.object({
  operator: z.enum(['gte', 'gt', 'lte', 'lt', 'eq']),
  value: z.number().finite(),
  unit: z.enum(['ratio', 'percent', 'count']).default('ratio'),
}).strict().superRefine((threshold, context) => {
  if (threshold.unit === 'ratio' && (threshold.value < 0 || threshold.value > 1)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Ratio thresholds must be between 0 and 1' });
  }
  if (threshold.unit === 'percent' && (threshold.value < 0 || threshold.value > 100)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Percent thresholds must be between 0 and 100' });
  }
  if (threshold.unit === 'count' && (!Number.isSafeInteger(threshold.value) || threshold.value < 0)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Count thresholds must be non-negative safe integers' });
  }
});
