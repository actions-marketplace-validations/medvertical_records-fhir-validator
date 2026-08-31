import { describe, expect, it } from 'vitest';
import { classifyReferenceRequestFailure } from './reference-request-failure';

describe('reference request failure classification', () => {
  it.each([
    ['ETIMEDOUT', 'Reference target request timed out'],
    ['ENOTFOUND', 'Reference target could not be resolved'],
    ['ECONNREFUSED', 'Reference target refused the connection'],
  ])('classifies %s without using exception text', (code, message) => {
    const failure = classifyReferenceRequestFailure(Object.assign(
      new Error('https://user:secret@internal.example/private'),
      { code },
    ));

    expect(failure).toEqual({
      message,
      metadata: { errorType: 'error', errorCode: code },
    });
    expect(JSON.stringify(failure)).not.toContain('secret');
  });

  it('drops unbounded custom error codes', () => {
    expect(classifyReferenceRequestFailure({
      code: 'secret-url:https://internal.example',
    })).toEqual({
      message: 'Reference target request failed',
      metadata: { errorType: 'non-error' },
    });
  });
});
