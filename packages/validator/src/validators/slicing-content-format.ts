export function resourceTypeFromPath(path: string): string {
  const firstSegment = path.split(".")[0]?.replace(/\[[^\]]+\]/g, "");
  return firstSegment || "Unknown";
}

export function formatConstraintValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
