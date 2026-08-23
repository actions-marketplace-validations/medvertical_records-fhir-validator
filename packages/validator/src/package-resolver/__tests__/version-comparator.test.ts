import { describe, it, expect } from 'vitest';
import { compareVersions, selectHighestVersion, detectVersionAlgorithm } from '../version-comparator';

describe('compareVersions', () => {
  it('compares semver major versions', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
  });

  it('compares semver minor versions', () => {
    expect(compareVersions('1.1.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0);
  });

  it('compares semver patch versions', () => {
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });

  it('ranks release above pre-release', () => {
    expect(compareVersions('1.0.0', '1.0.0-alpha')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeLessThan(0);
  });

  it('compares dotted numeric prerelease identifiers numerically', () => {
    expect(compareVersions('1.0.0-beta.10', '1.0.0-beta.2')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBeLessThan(0);
  });

  it('ignores build metadata for precedence', () => {
    expect(compareVersions('1.0.0+build.2', '1.0.0+build.1')).toBe(0);
  });

  it('compares year-based semver versions (2024.1.0 < 2025.1.0)', () => {
    // Detected as semver since it matches X.Y.Z pattern
    expect(detectVersionAlgorithm('2024.1.0')).toBe('semver');
    expect(compareVersions('2024.1.0', '2025.1.0')).toBeLessThan(0);
    expect(compareVersions('2025.1.0', '2024.1.0')).toBeGreaterThan(0);
  });

  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });
});

describe('selectHighestVersion (descending sort)', () => {
  it('returns the highest version from a list', () => {
    expect(selectHighestVersion(['1.0.0', '3.0.0', '2.0.0'])).toBe('3.0.0');
  });

  it('prefers release over pre-release at same version', () => {
    expect(selectHighestVersion(['1.0.0-beta', '1.0.0', '0.9.0'])).toBe('1.0.0');
  });

  it('returns undefined for empty array', () => {
    expect(selectHighestVersion([])).toBeUndefined();
  });

  it('returns the single element for a one-element array', () => {
    expect(selectHighestVersion(['4.0.1'])).toBe('4.0.1');
  });
});
