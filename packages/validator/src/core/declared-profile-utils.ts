export function getDeclaredProfiles(resource: unknown): string[] {
  if (!isRecord(resource) || !isRecord(resource.meta)) return [];
  const rawProfiles = resource.meta.profile;
  const profiles = typeof rawProfiles === 'string'
    ? [rawProfiles]
    : Array.isArray(rawProfiles)
      ? rawProfiles.filter((profile): profile is string => typeof profile === 'string')
      : [];

  return [...new Set(profiles.filter(profile => profile.trim().length > 0))];
}

export function getPrimaryDeclaredProfile(resource: unknown): string | undefined {
  return getDeclaredProfiles(resource)[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
