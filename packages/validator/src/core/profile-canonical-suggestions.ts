export function suggestProfilesForUnresolvedCanonical(
  profileUrl: string,
  availableProfiles: string[],
  limit = 3,
): string[] {
  const target = splitStructureDefinitionCanonical(profileUrl);
  if (!target) return [];

  const seen = new Set<string>();
  return availableProfiles
    .map(stripCanonicalVersion)
    .filter(candidate => {
      if (seen.has(candidate)) return false;
      seen.add(candidate);
      const parsed = splitStructureDefinitionCanonical(candidate);
      return parsed?.prefix === target.prefix && parsed.suffix !== target.suffix;
    })
    .map(candidate => ({
      candidate,
      score: profileTailSimilarity(target.suffix, splitStructureDefinitionCanonical(candidate)?.suffix ?? ''),
    }))
    .filter(result => result.score >= 0.7)
    .sort((left, right) => right.score - left.score || left.candidate.localeCompare(right.candidate))
    .slice(0, Math.max(0, limit))
    .map(result => result.candidate);
}

function stripCanonicalVersion(url: string): string {
  return url.split('|')[0];
}

function splitStructureDefinitionCanonical(url: string): { prefix: string; suffix: string } | null {
  const canonical = stripCanonicalVersion(url);
  const marker = '/StructureDefinition/';
  const index = canonical.indexOf(marker);
  if (index < 0) return null;
  return {
    prefix: canonical.slice(0, index + marker.length).toLowerCase(),
    suffix: canonical.slice(index + marker.length).toLowerCase(),
  };
}

function profileTailSimilarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = tokenizeProfileTail(left);
  const rightTokens = new Set(tokenizeProfileTail(right));
  const shared = leftTokens.filter(token => rightTokens.has(token)).length;
  const tokenScore = shared === 0 ? 0 : (2 * shared) / (leftTokens.length + rightTokens.size);
  const editScore = 1 - levenshteinDistance(left, right) / Math.max(left.length, right.length);
  return Math.max(tokenScore, editScore);
}

function tokenizeProfileTail(value: string): string[] {
  return value.split(/[^a-z0-9]+/).filter(token => token.length > 1);
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);
  for (let i = 1; i <= left.length; i++) {
    current[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + substitutionCost);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}
