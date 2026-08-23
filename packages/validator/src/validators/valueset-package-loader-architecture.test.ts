import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(file: string): string {
    return readFileSync(
        resolve(process.cwd(), 'packages/validator/src/validators', file),
        'utf8',
    );
}

const loaderSource = readSource('valueset-package-loader.ts');
const resourceAccessSource = readSource('valueset-package-resource-access.ts');

describe('ValueSet package loader architecture', () => {
    it('delegates filesystem package lookup through the resource-access boundary', () => {
        expect(loaderSource).toContain("from './valueset-package-resource-access'");
        expect(loaderSource).not.toMatch(/from ['"]node:(?:fs|os|path)['"]/);
        expect(loaderSource).not.toContain("from './valueset-package-search'");
    });

    it('keeps package directories and the scan index inside the resource-access boundary', () => {
        expect(resourceAccessSource).toContain('ValueSetPackageIndexCache');
        expect(resourceAccessSource).toContain('findResourceInPackages');
        expect(resourceAccessSource).toContain('findResourceByCanonicalScan');
    });
});
