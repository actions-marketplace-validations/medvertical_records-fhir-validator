const FHIR_CHOICE_TYPE_SUFFIXES = [
  'Address', 'Age', 'Annotation', 'Attachment', 'Availability',
  'Base64Binary', 'Boolean', 'Canonical', 'Code', 'CodeableConcept',
  'CodeableReference', 'Coding', 'ContactDetail', 'ContactPoint', 'Contributor',
  'Count', 'DataRequirement', 'Date', 'DateTime', 'Decimal', 'Distance',
  'Dosage', 'Duration', 'Expression', 'ExtendedContactDetail', 'Extension',
  'HumanName', 'Id', 'Identifier', 'Instant', 'Integer', 'Integer64',
  'Markdown', 'Meta', 'Money', 'Oid', 'ParameterDefinition', 'Period',
  'PositiveInt', 'Quantity', 'Range', 'Ratio', 'RatioRange', 'Reference',
  'RelatedArtifact', 'RelativeTime', 'SampledData', 'Signature', 'String',
  'Time', 'Timing', 'TriggerDefinition', 'UnsignedInt', 'Uri', 'Url',
  'UsageContext', 'Uuid', 'VirtualServiceDetail',
] as const;

const SORTED_FHIR_CHOICE_TYPE_SUFFIXES = [...FHIR_CHOICE_TYPE_SUFFIXES]
  .sort((left, right) => right.length - left.length);

export interface ConcreteChoiceProperty {
  baseName: string;
  typeSuffix: string;
}

export function splitConcreteChoiceProperty(key: string): ConcreteChoiceProperty | null {
  for (const typeSuffix of SORTED_FHIR_CHOICE_TYPE_SUFFIXES) {
    if (!key.endsWith(typeSuffix) || key.length === typeSuffix.length) continue;
    const baseName = key.slice(0, -typeSuffix.length);
    if (/^[A-Za-z][A-Za-z0-9]*$/.test(baseName)) {
      return { baseName, typeSuffix };
    }
  }
  return null;
}

export function isConcreteChoiceProperty(key: string, baseName: string): boolean {
  return splitConcreteChoiceProperty(key)?.baseName === baseName;
}

export function isChoiceSidecarProperty(key: string, baseName: string): boolean {
  return key.startsWith('_') && isConcreteChoiceProperty(key.slice(1), baseName);
}

export function findConcreteChoiceProperty(
  container: Record<string, unknown>,
  baseName: string,
): string | undefined {
  return Object.keys(container).find(key => isConcreteChoiceProperty(key, baseName));
}

export function findChoiceSidecarProperty(
  container: Record<string, unknown>,
  baseName: string,
): string | undefined {
  return Object.keys(container).find(key => isChoiceSidecarProperty(key, baseName));
}
