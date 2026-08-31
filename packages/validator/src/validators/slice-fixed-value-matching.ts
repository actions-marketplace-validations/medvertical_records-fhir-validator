import {
  canonicalBasesMatch,
  canonicalValuesMatch,
} from './slice-canonical-matching';
import { valuesMatch } from './slice-value-equality';

export function valueMatchesFixedConstraint(
  actualValue: unknown,
  fixedValue: unknown,
  fixedKind?: string,
): boolean {
  if (fixedKind === 'fixedCanonical') {
    return canonicalValuesMatch(actualValue, fixedValue);
  }

  return valuesMatch(actualValue, fixedValue);
}

export function valueCanIdentifyFixedSlice(
  actualValue: unknown,
  fixedValue: unknown,
  fixedKind?: string,
): boolean {
  if (fixedKind === 'fixedCanonical') {
    return canonicalValuesMatch(actualValue, fixedValue) || canonicalBasesMatch(actualValue, fixedValue);
  }

  return valuesMatch(actualValue, fixedValue);
}
