import { describe, expect, it, vi } from 'vitest';
import { ValueSetValidator } from '../valueset-validator';

describe('ValueSetValidator binding single-flight', () => {
  it('shares an identical in-flight binding resolution across page concurrency', async () => {
    const validator = new ValueSetValidator();
    let release!: (value: 'valid') => void;
    const result = new Promise<'valid'>(resolve => { release = resolve; });
    const resolveCodeBinding = vi.spyOn(
      validator as unknown as { resolveCodeBinding: () => Promise<'valid'> },
      'resolveCodeBinding',
    ).mockReturnValue(result);

    const first = validator.resolveCodeBindingForBinding(
      '123', 'http://loinc.org', 'http://example.test/vs', 'required', 'R4', 'Observation.code',
    );
    const second = validator.resolveCodeBindingForBinding(
      '123', 'http://loinc.org', 'http://example.test/vs', 'required', 'R4', 'Observation.code',
    );
    expect(resolveCodeBinding).toHaveBeenCalledTimes(1);

    release('valid');
    await expect(Promise.all([first, second])).resolves.toEqual(['valid', 'valid']);
  });

  it('does not share resolutions across paths or settings epochs', async () => {
    const validator = new ValueSetValidator();
    const resolveCodeBinding = vi.spyOn(
      validator as unknown as { resolveCodeBinding: () => Promise<'valid'> },
      'resolveCodeBinding',
    ).mockResolvedValue('valid');

    await validator.resolveCodeBindingForBinding('x', undefined, 'vs', 'preferred', 'R4', 'A.code');
    validator.setResolutionConfig({ strategy: 'local-only' });
    await validator.resolveCodeBindingForBinding('x', undefined, 'vs', 'preferred', 'R4', 'B.code');
    expect(resolveCodeBinding).toHaveBeenCalledTimes(2);
  });
});
