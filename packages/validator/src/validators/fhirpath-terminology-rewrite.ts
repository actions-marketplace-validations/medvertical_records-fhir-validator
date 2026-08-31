const TERMINOLOGY_FUNCTION_REPLACEMENTS = [
  ['memberOf', 'recordsAsyncMemberOf'],
  ['subsumes', 'recordsAsyncSubsumes'],
] as const;

export function rewriteFHIRPathTerminologyFunctions(expression: string): {
  expression: string;
  hasTerminologyFunction: boolean;
} {
  let result = '';
  let quote: "'" | '"' | null = null;
  let hasTerminologyFunction = false;

  for (let index = 0; index < expression.length;) {
    const character = expression[index];
    if (quote) {
      result += character;
      if (character === quote) {
        if (expression[index + 1] === quote) {
          result += expression[index + 1];
          index += 2;
          continue;
        }
        quote = null;
      }
      index += 1;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      result += character;
      index += 1;
      continue;
    }

    const replacement = terminologyFunctionReplacementAt(expression, index);
    if (replacement) {
      result += replacement.name;
      index += replacement.consumed;
      hasTerminologyFunction = true;
      continue;
    }
    result += character;
    index += 1;
  }
  return { expression: result, hasTerminologyFunction };
}

function terminologyFunctionReplacementAt(
  expression: string,
  index: number,
): { name: string; consumed: number } | null {
  for (const [original, replacement] of TERMINOLOGY_FUNCTION_REPLACEMENTS) {
    if (!expression.startsWith(original, index)) continue;
    if (isIdentifierCharacter(index > 0 ? expression[index - 1] : '')) continue;

    let cursor = index + original.length;
    if (isIdentifierCharacter(expression[cursor] ?? '')) continue;
    while (/\s/.test(expression[cursor] ?? '')) cursor += 1;
    if (expression[cursor] === '(') return { name: replacement, consumed: original.length };
  }
  return null;
}

function isIdentifierCharacter(value: string): boolean {
  return /[A-Za-z0-9_]/.test(value);
}
