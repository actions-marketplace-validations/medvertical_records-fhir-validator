export type RemoteSubsumptionOutcome =
  | 'subsumes'
  | 'subsumed-by'
  | 'equivalent'
  | 'not-subsumed';

export interface ParsedHierarchyResponse {
  display?: string;
  parents: string[];
  children: string[];
}

const SUBSUMPTION_OUTCOMES = new Set<RemoteSubsumptionOutcome>([
  'subsumes',
  'subsumed-by',
  'equivalent',
  'not-subsumed',
]);

interface ParametersResource {
  parameter: ParameterRecord[];
}

interface ParameterRecord {
  name?: string;
  valueCode?: string;
  valueString?: string;
  part?: ParameterRecord[];
}

export function parseSubsumptionResponse(
  value: unknown,
): RemoteSubsumptionOutcome | null {
  const parameters = parseParametersResource(value);
  if (!parameters) return null;
  const outcome = parameters.parameter.find(parameter =>
    parameter.name === 'outcome'
  )?.valueCode;
  return typeof outcome === 'string' &&
    SUBSUMPTION_OUTCOMES.has(outcome as RemoteSubsumptionOutcome)
    ? outcome as RemoteSubsumptionOutcome
    : null;
}

export function parseHierarchyResponse(
  value: unknown,
): ParsedHierarchyResponse | null {
  const parameters = parseParametersResource(value);
  if (!parameters) return null;

  const displayValue = parameters.parameter.find(parameter =>
    parameter.name === 'display'
  )?.valueString;
  return {
    ...(typeof displayValue === 'string' && displayValue.length > 0
      ? { display: displayValue }
      : {}),
    parents: extractPropertyCodes(parameters, 'parent'),
    children: extractPropertyCodes(parameters, 'child'),
  };
}

function parseParametersResource(value: unknown): ParametersResource | null {
  if (!isRecord(value) || value.resourceType !== 'Parameters') return null;
  const parameter = Array.isArray(value.parameter)
    ? value.parameter.map(parseParameter).filter(isPresent)
    : [];
  return { parameter };
}

function parseParameter(value: unknown): ParameterRecord | null {
  if (!isRecord(value)) return null;
  const part = Array.isArray(value.part)
    ? value.part.map(parseParameter).filter(isPresent)
    : undefined;
  return {
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(typeof value.valueCode === 'string' ? { valueCode: value.valueCode } : {}),
    ...(typeof value.valueString === 'string' ? { valueString: value.valueString } : {}),
    ...(part ? { part } : {}),
  };
}

function extractPropertyCodes(
  parameters: ParametersResource,
  relationship: 'parent' | 'child',
): string[] {
  const codes = new Set<string>();
  for (const parameter of parameters.parameter) {
    if (parameter.name !== 'property' || !parameter.part) continue;
    const isRelationship = parameter.part.some(part =>
      part.name === 'code' && part.valueCode === relationship
    );
    if (!isRelationship) continue;
    const value = parameter.part.find(part => part.name === 'value')?.valueCode;
    if (value) codes.add(value);
  }
  return [...codes];
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
