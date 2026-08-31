/**
 * fhirpath.js hands `userInvocationTable` functions ResourceNode wrappers for
 * model-typed inputs but raw values for direct contexts. Custom functions must
 * read through the wrapper — and, when they return resources, hand back typed
 * nodes so downstream type operators (`is`, `ofType`) keep working. The
 * ResourceNode class is not part of the library's public API, so the factory
 * is reached through the constructor of a node fhirpath.js already built.
 */

type ObjectRecord = Record<string, unknown>;

interface ResourceNodeLike extends ObjectRecord {
    data: unknown;
    _data?: unknown;
}

type ResourceNodeFactory = {
    makeResNode?: (
        evaluationContext: unknown,
        resource: unknown,
        parentResNode: null,
        path: null,
        _data: null,
        fhirNodeDataType: null,
    ) => unknown;
};

export function isFhirPathResourceNode(item: unknown): item is ResourceNodeLike {
    return isObjectRecord(item) && 'fhirNodeDataType' in item && 'data' in item;
}

/** The node's plain data value (a primitive node yields its primitive). */
export function unwrapFhirPathValue(item: unknown): unknown {
    return isFhirPathResourceNode(item) ? item.data : item;
}

/**
 * The node's navigable object. A primitive node keeps its sibling
 * `_property` sidecar (extensions) in `_data`, so that is the navigable
 * object for a primitive value.
 */
export function unwrapFhirPathNavigable(item: unknown): unknown {
    if (isFhirPathResourceNode(item)) {
        const nodeValue = item.data;
        const sidecar = isObjectRecord(item._data) ? item._data : undefined;
        if (isObjectRecord(nodeValue)) return sidecar ? { ...sidecar, ...nodeValue } : nodeValue;
        return sidecar ?? nodeValue;
    }
    return item;
}

/**
 * Wraps a resolved resource as a typed ResourceNode via the factory carried on
 * the template node's class, mirroring fhirpath.js's own async `resolve()`.
 * Without the wrap, `resolve() is Practitioner` sees an untyped object and is
 * always false. Falls back to the raw resource when no factory is reachable
 * (direct helper calls outside a fhirpath.js evaluation).
 */
export function makeTypedResourceNode(
    templateNode: unknown,
    evaluationContext: unknown,
    resource: unknown,
): unknown {
    if (!evaluationContext || !isFhirPathResourceNode(templateNode)) return resource;
    const nodeClass = templateNode.constructor as ResourceNodeFactory | undefined;
    if (typeof nodeClass?.makeResNode !== 'function') return resource;
    return nodeClass.makeResNode(evaluationContext, resource, null, null, null, null);
}

function isObjectRecord(value: unknown): value is ObjectRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
