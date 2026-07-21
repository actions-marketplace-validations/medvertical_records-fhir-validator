/**
 * Versioned, transport-safe read model for validation-run activity.
 *
 * This contract intentionally distinguishes issue occurrences from affected
 * resources. Consumers must not infer one from the other.
 */

export type ValidationRunLifecycleStatus =
  | 'idle'
  | 'queued'
  | 'initializing'
  | 'running'
  | 'paused'
  | 'interrupted'
  | 'stopped'
  | 'completed'
  | 'failed';

export type ValidationRunOutcome =
  | 'pass'
  | 'warn'
  | 'fail'
  | 'no-data'
  | 'cancelled'
  | 'error'
  | null;

export interface ValidationRunResourceTypeSnapshot {
  processed: number;
  total: number;
  issueOccurrences: {
    error: number;
    warning: number;
    information: number;
  };
  affectedResources: {
    error: number;
    warning: number;
  };
}

export interface ValidationRunActivityEventSnapshot {
  timestamp: string;
  resourceType?: string;
  resourceId?: string;
  status?: 'valid' | 'warning' | 'error';
  issueCount?: number;
  type?: 'resource_type_started' | 'resource_type_completed' | 'first_error' | 'first_warning' | 'milestone';
  message?: string;
}

export interface ValidationRunSnapshotV1 {
  schemaVersion: 1;
  runId: number | null;
  jobId: string | null;
  serverId: number | null;
  lifecycle: {
    status: ValidationRunLifecycleStatus;
    active: boolean;
    terminal: boolean;
    canPause: boolean;
    stoppedByUser: boolean;
    interruptedReason: string | null;
  };
  outcome: ValidationRunOutcome;
  progress: {
    processedResources: number;
    totalResources: number;
    validResources: number;
    validationUnits: {
      processed: number;
      total: number;
      embeddedProcessed: number;
      embeddedTotal: number;
      embeddedByType: Record<string, number>;
    };
    percentage: number;
    ratePerSecond: number;
    estimatedSecondsRemaining: number;
  };
  issues: {
    occurrences: {
      error: number;
      warning: number;
      information: number;
    };
    affectedResources: {
      error: number;
      warning: number;
    };
  };
  activity: {
    currentResourceType: string | null;
    activeResourceTypes: string[];
    nextResourceType: string | null;
    message: string | null;
    events: ValidationRunActivityEventSnapshot[];
  };
  queue: {
    length: number;
    currentRunId: number | null;
    processing: boolean;
  };
  resourceTypes: Record<string, ValidationRunResourceTypeSnapshot>;
  timestamps: {
    startedAt: string | null;
    completedAt: string | null;
    lastActivityAt: string | null;
  };
  integrity: {
    status: 'ok' | 'incomplete' | 'corrupt';
    reasons: string[];
  } | null;
  failure: {
    code: string | null;
    message: string | null;
  } | null;
}
