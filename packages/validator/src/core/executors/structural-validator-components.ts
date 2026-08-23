import { AttachmentValidator } from '../../validators/attachment-validator';
import { BundleValidator } from '../../validators/bundle-validator';
import { CanonicalResourceInvariantValidator } from '../../validators/canonical-resource-invariant-validator';
import { CardinalityValidator } from '../../validators/cardinality-validator';
import { ComplexTypeValidator } from '../../validators/complex-type-validator';
import { CompliesWithValidator } from '../../validators/complies-with-validator';
import { ElementRulesValidator } from '../../validators/element-rules-validator';
import { MustSupportValidator } from '../../validators/must-support-validator';
import { NarrativeValidator } from '../../validators/narrative-validator';
import { QuestionnaireValidator } from '../../validators/questionnaire-validator';
import { ReferenceFormatValidator } from '../../validators/reference-format-validator';
import { ReferenceTargetValidator } from '../../validators/reference-target-validator';
import { StringSecurityValidator } from '../../validators/string-security-validator';
import { StructureDefinitionValidator } from '../../validators/structure-definition-validator';
import { TypeValidator } from '../../validators/type-validator';
import type { ValueSetCache } from '../../validators/valueset-cache';
import { ValueSetValidator } from '../../validators/valueset-validator';
import type { StructureDefinitionLoader } from '../structure-definition-loader';

export interface StructuralExecutorDependencies {
  elementRulesValidator?: ElementRulesValidator;
  typeValidator?: TypeValidator;
  valueSetCache?: ValueSetCache;
  valueSetValidator?: ValueSetValidator;
}

export interface StructuralValidatorComponents {
  attachment: AttachmentValidator;
  bundle: BundleValidator;
  canonicalResourceInvariant: CanonicalResourceInvariantValidator;
  cardinality: CardinalityValidator;
  complexType: ComplexTypeValidator;
  compliesWith: CompliesWithValidator;
  elementRules: ElementRulesValidator;
  mustSupport: MustSupportValidator;
  narrative: NarrativeValidator;
  questionnaire: QuestionnaireValidator;
  referenceFormat: ReferenceFormatValidator;
  referenceTarget: ReferenceTargetValidator;
  stringSecurity: StringSecurityValidator;
  structureDefinition: StructureDefinitionValidator;
  type: TypeValidator;
}

export function createStructuralValidatorComponents(
  sdLoader: StructureDefinitionLoader,
  dependencies: StructuralExecutorDependencies,
): StructuralValidatorComponents {
  const type = dependencies.typeValidator ?? new TypeValidator();
  const elementRules = dependencies.elementRulesValidator ?? new ElementRulesValidator();
  const valueSet = dependencies.valueSetValidator
    ?? new ValueSetValidator(dependencies.valueSetCache);
  const referenceTarget = new ReferenceTargetValidator();
  referenceTarget.setProfileTypeResolver(url => sdLoader.getBaseResourceType(url));

  return {
    attachment: new AttachmentValidator(),
    bundle: new BundleValidator(),
    canonicalResourceInvariant: new CanonicalResourceInvariantValidator(),
    cardinality: new CardinalityValidator(),
    complexType: new ComplexTypeValidator(sdLoader, type, valueSet),
    compliesWith: new CompliesWithValidator(sdLoader),
    elementRules,
    mustSupport: new MustSupportValidator(),
    narrative: new NarrativeValidator(),
    questionnaire: new QuestionnaireValidator(dependencies.valueSetCache),
    referenceFormat: new ReferenceFormatValidator(),
    referenceTarget,
    stringSecurity: new StringSecurityValidator(),
    structureDefinition: new StructureDefinitionValidator(),
    type,
  };
}
