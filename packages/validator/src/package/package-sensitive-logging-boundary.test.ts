import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const paths = [
  'packages/validator/src/package/package-registry-client.ts',
  'packages/validator/src/package/package-registry-http.ts',
  'packages/validator/src/package/package-downloader.ts',
  'packages/validator/src/package/package-installation-store.ts',
  'packages/validator/src/package/package-profile-detector.ts',
  'server/services/fhir/profile-manager.ts',
  'server/services/fhir/profile-package-downloader.ts',
  'server/services/fhir/profile-cache-manager.ts',
  'server/services/fhir/profile-extractor.ts',
  'server/services/fhir/simplifier/simplifier-download.ts',
  'server/routes/api/fhir/profile-handlers/install-handlers.ts',
  'server/routes/api/fhir/profile-handlers/pack-handlers.ts',
];

describe('package artifact sensitive logging boundary', () => {
  it.each(paths)('%s emits fixed events with bounded metadata', (path) => {
    const source = readFileSync(path, 'utf8');
    const loggerCalls = collectLoggerCalls(path, source);

    for (const call of loggerCalls) {
      expect(call.arguments[0]?.getText(call.getSourceFile())).not.toContain('`');

      const sanitizedCall = call.getText(call.getSourceFile())
        .replace(/packageReferenceMetadata\([^)]*\)/g, '')
        .replace(/packageTargetMetadata\([^)]*\)/g, '')
        .replace(/packageErrorMetadata\([^)]*\)/g, '')
        .replace(/profileSourceErrorMetadata\([^)]*\)/g, '')
        .replace(/this\.registryName\([^)]*\)/g, '');

      expect(sanitizedCall).not.toMatch(/\b(?:packageId|profileUrl|tarballUrl|targetPath|packageDir|registryUrl)\b/);
      expect(sanitizedCall).not.toMatch(/\b(?:err|error)\.message\b/);
      expect(sanitizedCall).not.toMatch(/,\s*(?:err|error)\s*\)/);
    }
  });
});

function collectLoggerCalls(path: string, source: string): ts.CallExpression[] {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const calls: ts.CallExpression[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && ts.isIdentifier(node.expression.expression)
      && node.expression.expression.text === 'logger'
      && ['debug', 'info', 'warn', 'error'].includes(node.expression.name.text)
    ) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return calls;
}
