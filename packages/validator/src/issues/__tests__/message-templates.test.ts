import { describe, expect, it } from 'vitest';
import { formatMessage } from '../message-templates.js';

describe('profile message templates', () => {
  it('describes fixed-value mismatches with their path and values', () => {
    expect(formatMessage('profile-fixed-value-mismatch', {
      path: 'Location.status',
      expected: '"active"',
      actual: '"inactive"',
    })).toBe(
      'Element Location.status must match the fixed profile value "active"; found "inactive"',
    );
  });
});
