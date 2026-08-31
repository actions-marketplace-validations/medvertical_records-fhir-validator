import { describe, expect, it } from 'vitest';
import {
  makeTypedResourceNode,
  unwrapFhirPathNavigable,
  unwrapFhirPathValue,
} from '../fhirpath-node-unwrap';

class FakeResourceNode {
  static madeWith: unknown[] | null = null;

  static makeResNode(...args: unknown[]): unknown {
    FakeResourceNode.madeWith = args;
    return { typed: args[1] };
  }

  constructor(
    public data: unknown,
    public _data: unknown = undefined,
    public fhirNodeDataType: string | null = null,
  ) {}
}

describe('fhirpath-node-unwrap', () => {
  it('unwraps node data and passes raw values through', () => {
    const node = new FakeResourceNode({ reference: 'Patient/1' }, undefined, 'Reference');
    expect(unwrapFhirPathValue(node)).toEqual({ reference: 'Patient/1' });
    expect(unwrapFhirPathValue({ reference: 'Patient/1' })).toEqual({ reference: 'Patient/1' });
    expect(unwrapFhirPathValue('plain')).toBe('plain');
  });

  it('merges the primitive sidecar into the navigable object', () => {
    const sidecar = { extension: [{ url: 'http://example.org/ext', valueString: 'x' }] };
    const node = new FakeResourceNode('primitive-value', sidecar, 'string');
    expect(unwrapFhirPathNavigable(node)).toEqual(sidecar);

    const complexNode = new FakeResourceNode({ id: 'a' }, { extension: [] }, 'Reference');
    expect(unwrapFhirPathNavigable(complexNode)).toEqual({ id: 'a', extension: [] });
  });

  it('wraps resolved resources through the template node class factory', () => {
    const template = new FakeResourceNode({ reference: 'Practitioner/p1' }, undefined, 'Reference');
    const evaluationContext = { model: 'r4' };
    const practitioner = { resourceType: 'Practitioner', id: 'p1' };

    const wrapped = makeTypedResourceNode(template, evaluationContext, practitioner);

    expect(wrapped).toEqual({ typed: practitioner });
    expect(FakeResourceNode.madeWith?.[0]).toBe(evaluationContext);
  });

  it('falls back to the raw resource without a factory or evaluation context', () => {
    const practitioner = { resourceType: 'Practitioner', id: 'p1' };
    const template = new FakeResourceNode({ reference: 'Practitioner/p1' }, undefined, 'Reference');

    expect(makeTypedResourceNode({ reference: 'x' }, { model: 'r4' }, practitioner)).toBe(practitioner);
    expect(makeTypedResourceNode(template, undefined, practitioner)).toBe(practitioner);
  });
});
