import { describe, expect, it } from 'vitest';
import { calculateValidationIssueScore } from './scoring';

describe('calculateValidationIssueScore', () => {
  it('applies the canonical error, warning, and information weights', () => {
    expect(calculateValidationIssueScore(1, 2, 3)).toBe(72);
  });

  it('clamps the score at zero', () => {
    expect(calculateValidationIssueScore(20, 0, 0)).toBe(0);
  });
});
