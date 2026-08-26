/**
 * Cross-major ValueSet version fallback must not produce required-binding
 * errors: R4 and R5 core code systems diverge (R4 encounter-status has
 * 'finished' where R5 has 'completed'), so serving the R4 expansion under a
 * `|5.0.0` canonical turned valid R5 codes into ERRORs. Without an exact-major
 * candidate the expansion must stay empty and the binding degrade to
 * 'unverified'.
 */
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { TerminologyApiClient } from '../terminology-api-client';
import { resolveValueSetCodeBinding } from '../valueset-code-binding-resolver';
import { ValueSetCache } from '../valueset-cache';
import { createEmptyTerminologyDiagnostics } from '../valueset-diagnostics';
import { expandValueSet } from '../valueset-expansion-loader';
import { ValueSetPackageLoader } from '../valueset-package-loader';
import { ValueSetPackageResourceAccess } from '../valueset-package-resource-access';
import { TwoPhaseShadowEvaluator } from '../valueset-two-phase-shadow';
import type { TerminologyResolutionConfig } from '../valueset-types';

const VALUE_SET_CANONICAL = 'http://hl7.org/fhir/ValueSet/encounter-status';
const CODE_SYSTEM_CANONICAL = 'http://hl7.org/fhir/encounter-status';

const R4_CODES = [
  'planned', 'arrived', 'triaged', 'in-progress', 'onleave',
  'finished', 'cancelled', 'entered-in-error', 'unknown',
];
const R5_CODES = [
  'planned', 'in-progress', 'on-hold', 'discharged', 'completed',
  'cancelled', 'discontinued', 'entered-in-error', 'unknown',
];

describe('required binding with cross-major version fallback (R5 Encounter.status)', () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map(root =>
      fs.rm(root, { force: true, recursive: true }),
    ));
  });

  async function writeCorePackage(root: string, major: '4' | '5'): Promise<void> {
    const version = major === '4' ? '4.0.1' : '5.0.0';
    const packagePath = path.join(root, `hl7.fhir.r${major}.core#${version}`, 'package');
    await fs.mkdir(packagePath, { recursive: true });
    await fs.writeFile(
      path.join(packagePath, 'ValueSet-encounter-status.json'),
      JSON.stringify({
        resourceType: 'ValueSet',
        url: VALUE_SET_CANONICAL,
        version,
        status: 'active',
        compose: { include: [{ system: CODE_SYSTEM_CANONICAL }] },
      }),
    );
    await fs.writeFile(
      path.join(packagePath, 'CodeSystem-encounter-status.json'),
      JSON.stringify({
        resourceType: 'CodeSystem',
        url: CODE_SYSTEM_CANONICAL,
        version,
        status: 'active',
        content: 'complete',
        concept: (major === '4' ? R4_CODES : R5_CODES).map(code => ({ code })),
      }),
    );
  }

  async function makeHarness(majors: Array<'4' | '5'>) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'records-version-fallback-'));
    temporaryRoots.push(root);
    for (const major of majors) await writeCorePackage(root, major);

    const cache = new ValueSetCache();
    const packageLoader = new ValueSetPackageLoader(
      cache,
      new ValueSetPackageResourceAccess([root]),
    );
    const resolutionConfig: TerminologyResolutionConfig = {
      strategy: 'local-only',
      serverDelegation: {
        expandValueSets: false,
        validateCodes: false,
        cacheResults: false,
        cacheTTLSeconds: 0,
      },
    };
    const apiClient = {} as TerminologyApiClient;
    const terminologyDiagnostics = createEmptyTerminologyDiagnostics();
    const deps = {
      getExpandedValueSet: (valueSetUrl: string, fhirVersion?: 'R4' | 'R5' | 'R6') =>
        expandValueSet({ cache, apiClient, packageLoader, resolutionConfig }, valueSetUrl, fhirVersion),
      hasTerminologyServer: () => false,
      packageLoader,
      resolutionConfig,
      resolveServerForSystem: () => undefined,
      terminologyDiagnostics,
      twoPhaseShadow: new TwoPhaseShadowEvaluator(packageLoader, resolutionConfig.twoPhaseExpansion),
      validateViaServer: async () => 'unverified' as const,
    };
    return { deps, packageLoader, terminologyDiagnostics };
  }

  it("yields 'unverified' (not 'invalid') for R5 'completed' when only the R4 4.0.1 copy exists", async () => {
    const { deps, packageLoader, terminologyDiagnostics } = await makeHarness(['4']);

    await expect(
      packageLoader.loadValueSet(`${VALUE_SET_CANONICAL}|5.0.0`, 'R5'),
    ).resolves.toBeNull();

    const outcome = await resolveValueSetCodeBinding(
      deps,
      'completed',
      CODE_SYSTEM_CANONICAL,
      `${VALUE_SET_CANONICAL}|5.0.0`,
      'required',
      'R5',
      'Encounter.status',
    );

    expect(outcome).toBe('unverified');
    expect(terminologyDiagnostics.unverifiedBindings.byReason['empty-expansion']).toBe(1);
  });

  it('resolves the 5.0.0 expansion exactly when the R5 copy is present alongside R4', async () => {
    const { deps } = await makeHarness(['4', '5']);

    await expect(resolveValueSetCodeBinding(
      deps,
      'completed',
      CODE_SYSTEM_CANONICAL,
      `${VALUE_SET_CANONICAL}|5.0.0`,
      'required',
      'R5',
      'Encounter.status',
    )).resolves.toBe('valid');

    // 'finished' exists only in the R4 code system — an 'invalid' here proves
    // the 5.0.0 expansion (not a cross-major stand-in) is authoritative.
    await expect(resolveValueSetCodeBinding(
      deps,
      'finished',
      CODE_SYSTEM_CANONICAL,
      `${VALUE_SET_CANONICAL}|5.0.0`,
      'required',
      'R5',
      'Encounter.status',
    )).resolves.toBe('invalid');
  });
});
