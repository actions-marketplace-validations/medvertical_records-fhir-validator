export function asSecurityRecord(
    value: unknown,
): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

export function getSecurityResourceType(
    resource: Record<string, unknown>,
): string {
    return typeof resource.resourceType === 'string' && resource.resourceType.length > 0
        ? resource.resourceType
        : 'Unknown';
}
