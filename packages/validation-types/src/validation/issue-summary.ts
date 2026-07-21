export type ValidationIssueSummarySeverity = 'error' | 'warning' | 'information';

export interface ValidationIssueSummaryScopeV1 {
  source: 'current' | 'live' | 'run' | 'browsed' | 'demo';
  serverId?: number;
  environment?: string;
  runId?: number;
}

export interface ValidationIssueSeverityMetricsV1 {
  issueTypes: number;
  occurrences: number;
  affectedResources: number;
}

/**
 * Complete, unpaginated issue metrics for one explicit inventory/run scope.
 * List endpoints may be bounded; this summary must never be derived from a
 * page of groups.
 */
export interface ValidationIssueSummaryV1 {
  version: 1;
  scope: ValidationIssueSummaryScopeV1;
  totalGroups: number;
  occurrences: number;
  totalResourcesValidated: number | null;
  affectedResources: number;
  affectedResourcePercent: number | null;
  bySeverity: Record<ValidationIssueSummarySeverity, number>;
  severityMetrics: Record<ValidationIssueSummarySeverity, ValidationIssueSeverityMetricsV1>;
  byAspect: Array<{
    aspect: string;
    issueGroups: number;
    affectedResourceHits: number;
  }>;
  affectedResourceTypes: number;
  topResourceTypes: Array<{
    resourceType: string;
    affectedResources: number;
  }>;
  largestCluster: {
    signature: string;
    aspect: string;
    severity: ValidationIssueSummarySeverity;
    code?: string;
    canonicalPath: string;
    sampleMessage: string;
    affectedResources: number;
    resourceType?: string;
  } | null;
}

export type ValidationIssueSummaryMetrics = Omit<ValidationIssueSummaryV1, 'version' | 'scope'>;
