import { ProfileCache } from '../cache/profile-cache';
import { ConstraintValidator } from '../validators/constraint-validator';
import { ElementRulesValidator } from '../validators/element-rules-validator';
import { ExtensionValidator } from '../validators/extension-validator';
import { SDFHIRPathExecutor } from '../validators/sd-fhirpath-executor';
import { SlicingValidator } from '../validators/slicing-validator';
import { TerminologyResourceValidator } from '../validators/terminology-resource-validator';
import { TypeValidator } from '../validators/type-validator';
import { ValueSetCache } from '../validators/valueset-cache';
import { ValueSetValidator } from '../validators/valueset-validator';
import { SnapshotGenerator } from './snapshot-generator';
import { StructureDefinitionLoader } from './structure-definition-loader';
import type { RecordsValidatorConfig } from './validator-engine-config';

export interface ValidatorCoreComponents {
  profileCache: ProfileCache;
  sdLoader: StructureDefinitionLoader;
  typeValidator: TypeValidator;
  extensionValidator: ExtensionValidator;
  slicingValidator: SlicingValidator;
  constraintValidator: ConstraintValidator;
  valuesetValidator: ValueSetValidator;
  elementRulesValidator: ElementRulesValidator;
  snapshotGenerator: SnapshotGenerator;
  sdFHIRPathExecutor: SDFHIRPathExecutor;
  terminologyResourceValidator: TerminologyResourceValidator;
}

export interface ValidatorCoreRuntime {
  components: ValidatorCoreComponents;
  terminologyCache: ValueSetCache;
}

export function createValidatorCoreRuntime(
  config: RecordsValidatorConfig,
): ValidatorCoreRuntime {
  const profileCacheMaxEntries = config.profileCacheMaxEntries ?? 192;
  const profileCache = new ProfileCache(config.enableCaching, profileCacheMaxEntries);
  const sdLoader = new StructureDefinitionLoader(
    config.packageCachePath ?? '/tmp/fhir-packages',
    config.bundledProfilesPath,
    {
      autoDownload: config.autoDownload,
      allowedPackages: config.allowedPackages,
      packageVersionPins: config.packageVersionPins,
      maxCacheEntries: profileCacheMaxEntries,
      prewarmProfileSource: config.prewarmProfileSource,
    },
  );
  const typeValidator = new TypeValidator();
  const terminologyCache = new ValueSetCache();
  const valuesetValidator = new ValueSetValidator(terminologyCache);
  const sdFHIRPathExecutor = new SDFHIRPathExecutor(terminologyCache);
  const terminologyResourceValidator = new TerminologyResourceValidator(terminologyCache);
  const elementRulesValidator = new ElementRulesValidator();
  const snapshotGenerator = new SnapshotGenerator(sdLoader, profileCacheMaxEntries);
  const extensionValidator = new ExtensionValidator(
    sdLoader,
    typeValidator,
    valuesetValidator,
    elementRulesValidator,
    sdFHIRPathExecutor,
  );
  const slicingValidator = new SlicingValidator();
  slicingValidator.setTypeProfileResolver(async (url: string) => {
    const structureDefinition = await sdLoader.loadProfile(url);
    if (!structureDefinition) return null;
    if (structureDefinition.snapshot?.element?.length) return structureDefinition;

    const elements = await snapshotGenerator.generateSnapshot(structureDefinition);
    return elements.length > 0
      ? { ...structureDefinition, snapshot: { element: elements } }
      : structureDefinition;
  });
  const constraintValidator = new ConstraintValidator(
    valuesetValidator,
    undefined,
    terminologyCache,
    undefined,
    valuesetValidator.getOperationCache(),
  );

  return {
    terminologyCache,
    components: {
      profileCache,
      sdLoader,
      typeValidator,
      extensionValidator,
      slicingValidator,
      constraintValidator,
      valuesetValidator,
      elementRulesValidator,
      snapshotGenerator,
      sdFHIRPathExecutor,
      terminologyResourceValidator,
    },
  };
}
