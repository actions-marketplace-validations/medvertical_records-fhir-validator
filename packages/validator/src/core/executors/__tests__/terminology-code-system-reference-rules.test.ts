import { describe, expect, it } from 'vitest';
import { validateCodeSystemReference } from '../terminology-code-system-reference-rules';
import { validateExternalCodeSystems } from '../terminology-external-code-system-rules';

describe('terminology CodeSystem reference rules', () => {
  it('leaves a non-string Coding.system to structural type validation', async () => {
    await expect(validateCodeSystemReference(
      { system: { invalidType: true }, code: 'x' },
      'Observation.code.coding',
      0,
      true,
      'syntax',
      'R4',
    )).resolves.toEqual([]);
  });

  it('does not pass malformed Coding fields into CodeSystem resolution', async () => {
    const valueSetValidator = {
      validateCodeInCodeSystem: () => {
        throw new Error('must not be called for malformed Coding fields');
      },
    };

    await expect(validateExternalCodeSystems(
      { system: { invalidType: true }, code: 'x' },
      'Observation.code.coding',
      valueSetValidator as any,
      'R4',
    )).resolves.toEqual([]);
  });
});
