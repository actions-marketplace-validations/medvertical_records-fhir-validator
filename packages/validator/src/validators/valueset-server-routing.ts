import { logger } from '../logger';
import type { TerminologyResolutionConfig, TerminologyServerOverride } from './valueset-types';
import { type FhirVersion, versionedExpansionCacheKey } from './valueset-expansion-cache-key';
import { terminologyTargetMetadata } from '../utils/sensitive-logging-metadata';
import { canDelegateValueSetExpansion } from './valueset-delegation-policy';
import { getTerminologyServerScope } from './terminology-server-scope';

export function resolveTerminologyServerForSystem(
  config: TerminologyResolutionConfig,
  system?: string,
): TerminologyServerOverride | undefined {
  if (!system) return undefined;
  const servers = config.servers;
  if (!servers || servers.length === 0) return undefined;

  const match = servers.find(s =>
    s.enabled
    && !s.circuitOpen
    && s.preferredSystems
    && s.preferredSystems.includes(system),
  );
  if (!match) return undefined;

  logger.debug('[ValueSetValidator] Scope-routed terminology request', {
    ...terminologyTargetMetadata(system, match.url),
    serverId: match.id,
  });
  return {
    url: match.url,
    auth: match.authConfig,
  };
}

export function hasTerminologyServer(
  config: TerminologyResolutionConfig,
  override?: { url: string },
): boolean {
  return Boolean(override?.url || config.serverUrl);
}

export function getScopedExpansionCacheKey(
  valueSetUrl: string,
  config: TerminologyResolutionConfig,
  fhirVersion?: FhirVersion,
): string {
  const baseKey = versionedExpansionCacheKey(valueSetUrl, fhirVersion);
  const defaultServerScope = config.serverUrl
    ? getTerminologyServerScope(config.serverUrl, config.auth)
    : 'no-server';
  const serverScope = [
    config.strategy,
    defaultServerScope,
    canDelegateValueSetExpansion(config) ? 'expand-on' : 'expand-off',
    ...(config.servers ?? []).map(server => [
      server.id,
      getTerminologyServerScope(server.url, server.authConfig),
      server.enabled ? 'on' : 'off',
    ].join(':')),
  ].join('|');

  return `${baseKey}|${serverScope}`;
}
