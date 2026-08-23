import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const paths = [
  'packages/validator/src/reference/batched-reference-checker.ts',
  'packages/validator/src/reference/reference-circuit-breaker.ts',
  'packages/validator/src/reference/circular-reference-detector.ts',
  'packages/validator/src/reference/recursive-reference-validator.ts',
  'packages/validator/src/reference/reference-validation-runtime.ts',
  'packages/validator/src/reference/reference-validator-refactored.ts',
];

describe('reference validation sensitive logging boundary', () => {
  it.each(paths)('%s does not emit reference identities or raw errors', (path) => {
    const source = readFileSync(path, 'utf8');
    for (const call of collectLoggerCalls(path, source)) {
      const text = call.getText(call.getSourceFile());
      expect(text).not.toMatch(
        /\$\{(?:reference|refIdentifier|nodeId|host|canonical|resourceId)\b/,
      );
      expect(text).not.toMatch(
        /,\s*(?:error|err|reference|refIdentifier|nodeId|host|canonical|resourceId)\s*[},)]/,
      );
    }
  });
});

function collectLoggerCalls(path: string, source: string): ts.CallExpression[] {
  const sourceFile = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
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
