export interface IssueRuleIdentityInput {
  code?: string | null;
  ruleId?: string | null;
}

export function getSpecificIssueRuleId(input: IssueRuleIdentityInput): string | null {
  const code = input.code?.trim().toLowerCase();
  const prefix = 'constraint-violation-';
  if (code?.startsWith(prefix)) {
    const key = code.slice(prefix.length).trim();
    return key.length > 0 ? key : null;
  }
  if (code === 'profile-constraint-violation' || code === 'profile-constraint-warning') {
    return null;
  }

  const explicitRule = input.ruleId?.trim().toLowerCase();
  if (explicitRule) return explicitRule;

  const invariantSpecificKey = code?.match(/^(?:[a-z][a-z0-9]*-)+invariant-(.+)$/)?.[1];
  if (invariantSpecificKey) return invariantSpecificKey;
  if (code?.endsWith('-violation')) {
    const key = code.slice(0, -'-violation'.length);
    return key.length > 0 ? key : null;
  }
  return code && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/.test(code) ? code : null;
}

export function getEffectiveIssueRuleId(input: IssueRuleIdentityInput): string | null {
  const explicitRule = input.ruleId?.trim().toLowerCase();
  return explicitRule || getSpecificIssueRuleId(input);
}
