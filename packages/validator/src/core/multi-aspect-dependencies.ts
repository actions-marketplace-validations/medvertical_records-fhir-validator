import type { ProfileCache } from '../cache/profile-cache';
import type { BestPracticeValidator } from '../validators/best-practice-validator';
import type {
  CustomRuleExecutor,
  InvariantExecutor,
  MetadataExecutor,
  ProfileExecutor,
  ReferenceExecutor,
  StructuralExecutor,
  TerminologyExecutor,
} from './executors';
import type { FhirClientLike } from './profile-loader-utils';
import type { QuestionnaireContextRegistry } from './questionnaire-context-registry';
import type { SnapshotGenerator } from './snapshot-generator';
import type { StructureDefinitionLoader } from './structure-definition-loader';
import type { SDFHIRPathExecutor } from '../validators/sd-fhirpath-executor';
import type { TerminologyResourceValidator } from '../validators/terminology-resource-validator';

export interface MultiAspectDeps {
  sdLoader: StructureDefinitionLoader;
  snapshotGenerator: SnapshotGenerator;
  profileCache?: ProfileCache;
  fhirClient?: FhirClientLike;
  structuralExecutor: StructuralExecutor;
  profileExecutor: ProfileExecutor;
  terminologyExecutor: TerminologyExecutor;
  referenceExecutor: ReferenceExecutor;
  invariantExecutor: InvariantExecutor;
  customRuleExecutor: CustomRuleExecutor;
  metadataExecutor: MetadataExecutor;
  bestPracticeValidator: BestPracticeValidator;
  questionnaireRegistry: QuestionnaireContextRegistry;
  strictMode: boolean;
  sdFHIRPathExecutor?: SDFHIRPathExecutor;
  terminologyResourceValidator: TerminologyResourceValidator;
}
