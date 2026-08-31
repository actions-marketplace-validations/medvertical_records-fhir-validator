const CLOSED_RECORDS_ROOT_NAMES = new Set(['records', 'rest-express']);

/**
 * Inspect the workspace-root publication policy without touching the filesystem.
 *
 * The legacy name remains recognized so older release commits are still audited
 * correctly when the export tooling is run from a historical checkout.
 */
export function inspectRootPackagePolicy(rootPackage) {
  const violations = [];
  const isClosedRecordsMonorepo = CLOSED_RECORDS_ROOT_NAMES.has(rootPackage?.name);

  if (
    isClosedRecordsMonorepo
    && (rootPackage.private !== true || rootPackage.license !== 'UNLICENSED')
  ) {
    violations.push('root package must remain private + UNLICENSED');
  } else if (!isClosedRecordsMonorepo && rootPackage?.private !== true) {
    violations.push('public repo workspace root must remain private');
  }

  return violations;
}
