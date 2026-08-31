import { describe, expect, it } from 'vitest';
import {
  CircularReferenceDetector,
} from './circular-reference-detector';
import {
  findNodeByReference,
  type ReferenceNode,
} from './reference-graph-builder';

describe('CircularReferenceDetector boundaries', () => {
  it('detects a Bundle cycle and reports the reference count', () => {
    const result = new CircularReferenceDetector().detectCircularReferences({
      resourceType: 'Bundle',
      entry: [
        {
          fullUrl: 'Patient/1',
          resource: {
            resourceType: 'Patient',
            id: '1',
            link: [{ other: { reference: 'Patient/2' } }],
          },
        },
        {
          fullUrl: 'Patient/2',
          resource: {
            resourceType: 'Patient',
            id: '2',
            link: [{ other: { reference: 'Patient/1' } }],
          },
        },
      ],
    });

    expect(result.hasCircularReference).toBe(true);
    expect(result.totalReferences).toBe(2);
  });

  it('does not match resource IDs by substring', () => {
    const node: ReferenceNode = {
      id: 'https://example.org/fhir/Patient/12',
      resourceType: 'Patient',
      references: [],
      depth: 0,
    };
    const nodes = new Map([[node.id, node]]);

    expect(findNodeByReference('Patient/1', nodes)).toBeNull();
    expect(findNodeByReference('Patient/12', nodes)).toBe(node.id);
  });

  it('clamps invalid depth limits', () => {
    const detector = new CircularReferenceDetector(Number.POSITIVE_INFINITY);
    expect(detector.getMaxDepthLimit()).toBe(10);

    detector.setMaxDepthLimit(-5);
    expect(detector.getMaxDepthLimit()).toBe(1);

    detector.setMaxDepthLimit(500);
    expect(detector.getMaxDepthLimit()).toBe(100);
  });

  it('handles malformed and cyclic objects', () => {
    const resource: Record<string, unknown> = {
      resourceType: 'Patient',
      contained: [null, 'invalid'],
    };
    resource.self = resource;

    expect(new CircularReferenceDetector().detectCircularReferences(resource))
      .toMatchObject({ hasCircularReference: false, totalReferences: 0 });
  });
});
