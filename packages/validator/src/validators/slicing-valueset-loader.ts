import { ValueSetCache } from './valueset-cache';
import { ValueSetPackageLoader } from './valueset-package-loader';

export function createIsolatedSlicingValueSetLoader(): ValueSetPackageLoader {
  // ValueSetPackageLoader expands home placeholders itself. Keeping loader
  // creation side-effect free also prevents concurrent validations from
  // observing a temporarily deleted process-wide environment variable.
  return new ValueSetPackageLoader(new ValueSetCache());
}
