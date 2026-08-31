import { describe, expect, it } from 'vitest';
import {
  ConstraintExpressionCache,
} from '../constraint-expression-cache';
import { SDFHIRPathExpressionCache } from '../sd-fhirpath-expression-cache';

const invalidExpression = 'Patient.name.';

describe('FHIRPath expression caches', () => {
  it('reuses a compiled synchronous evaluator', () => {
    const expressionCache = new ConstraintExpressionCache();

    const first = expressionCache.getOrCompile('Patient.active', 'R4');
    const second = expressionCache.getOrCompile('Patient.active', 'R4');

    expect(second).toBe(first);
    expect(first({ resourceType: 'Patient', active: true })).toEqual([true]);
    expect(expressionCache.getStats()).toEqual(expect.objectContaining({
      hits: 1,
      misses: 1,
      compileErrors: 0,
      size: 1,
    }));
  });

  it('negative-caches ConstraintValidator compile failures', () => {
    const expressionCache = new ConstraintExpressionCache();

    expect(() => expressionCache.getOrCompile(invalidExpression, 'R4')).toThrow();
    expect(expressionCache.getStats()).toEqual(expect.objectContaining({
      hits: 0,
      misses: 1,
      compileErrors: 1,
      size: 1,
    }));

    expect(() => expressionCache.getOrCompile(invalidExpression, 'R4')).toThrow();
    expect(expressionCache.getStats()).toEqual(expect.objectContaining({
      hits: 1,
      misses: 1,
      compileErrors: 1,
      size: 1,
    }));
  });

  it('negative-caches SD executor compile failures', () => {
    const expressionCache = new SDFHIRPathExpressionCache();

    expect(expressionCache.getOrCompile(invalidExpression, 'R4')).toBeNull();
    expect(expressionCache.getStats()).toEqual(expect.objectContaining({
      hits: 0,
      misses: 1,
      compileErrors: 1,
      size: 1,
    }));

    expect(expressionCache.getOrCompile(invalidExpression, 'R4')).toBeNull();
    expect(expressionCache.getStats()).toEqual(expect.objectContaining({
      hits: 1,
      misses: 1,
      compileErrors: 1,
      size: 1,
    }));
  });

  it('reuses a compiled synchronous SD evaluator', () => {
    const expressionCache = new SDFHIRPathExpressionCache();

    const first = expressionCache.getOrCompile('Patient.active', 'R4');
    const second = expressionCache.getOrCompile('Patient.active', 'R4');

    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(first?.({ resourceType: 'Patient', active: true })).toEqual([true]);
    expect(expressionCache.getStats()).toEqual(expect.objectContaining({
      hits: 1,
      misses: 1,
      compileErrors: 0,
      size: 1,
    }));
  });
});
