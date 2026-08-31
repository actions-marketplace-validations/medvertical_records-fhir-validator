import { describe, expect, it } from 'vitest';
import { packageMatchesMajor } from '../valueset-package-search';

describe('packageMatchesMajor', () => {
    it('recognises the release marker in the middle of a package name', () => {
        expect(packageMatchesMajor('hl7.fhir.r4.core#4.0.1', '4')).toBe(true);
        expect(packageMatchesMajor('hl7.fhir.uv.extensions.r4#5.2.0', '4')).toBe(true);
    });

    it('recognises the release marker at the end of the bare name before #version', () => {
        expect(packageMatchesMajor('hl7.terminology.r4#6.5.0', '4')).toBe(true);
        expect(packageMatchesMajor('hl7.terminology.r5#7.1.0', '5')).toBe(true);
        expect(packageMatchesMajor('hl7.terminology.r4', '4')).toBe(true);
    });

    it('does not match a different major release', () => {
        expect(packageMatchesMajor('hl7.terminology.r4#6.5.0', '5')).toBe(false);
        expect(packageMatchesMajor('hl7.fhir.r5.core#5.0.0', '4')).toBe(false);
    });

    it('does not treat the version suffix as part of the name', () => {
        // The digit after '#' must never satisfy the marker (e.g. '...r4#4.0.1'
        // read as ending in '4' for major 4 is fine, but '#5...' must not flip
        // an r4 package into an r5 match).
        expect(packageMatchesMajor('hl7.terminology.r4#5.0.0', '5')).toBe(false);
    });

    it('does not match version-neutral package names', () => {
        expect(packageMatchesMajor('hl7.terminology#7.3.0', '4')).toBe(false);
        expect(packageMatchesMajor('de.basisprofil.r4#1.5.4', '5')).toBe(false);
        expect(packageMatchesMajor('ihe.iti.balp#1.1.0', '4')).toBe(false);
    });

    it('returns false without a preferred major', () => {
        expect(packageMatchesMajor('hl7.terminology.r4#6.5.0', undefined)).toBe(false);
    });
});
