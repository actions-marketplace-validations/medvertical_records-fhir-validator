import { describe, expect, it } from 'vitest';
import { getTerminologyServerScope } from '../terminology-server-scope';

describe('terminology server cache scope', () => {
  it('is stable for equivalent auth and changes with credentials', () => {
    const serverUrl = 'https://tx.example.test/fhir';
    const first = getTerminologyServerScope(serverUrl, {
      type: 'oauth2',
      clientId: 'client',
      clientSecret: 'secret-a',
      tokenUrl: 'https://auth.example.test/token',
      scope: 'terminology.read',
    });
    const equivalent = getTerminologyServerScope(serverUrl, {
      type: 'oauth2',
      clientId: 'client',
      clientSecret: 'secret-a',
      tokenUrl: 'https://auth.example.test/token',
      scope: 'terminology.read',
    });
    const second = getTerminologyServerScope(serverUrl, {
      type: 'oauth2',
      clientId: 'client',
      clientSecret: 'secret-b',
      tokenUrl: 'https://auth.example.test/token',
      scope: 'terminology.read',
    });

    expect(equivalent).toBe(first);
    expect(second).not.toBe(first);
    expect(first).not.toContain('secret-a');
    expect(second).not.toContain('secret-b');
  });

  it('uses one explicit scope for absent and none authentication', () => {
    const serverUrl = 'https://tx.example.test/fhir';

    expect(getTerminologyServerScope(serverUrl, undefined)).toBe(
      getTerminologyServerScope(serverUrl, { type: 'none' }),
    );
  });
});
