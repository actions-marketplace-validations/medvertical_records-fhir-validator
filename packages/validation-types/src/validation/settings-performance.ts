// ============================================================================
// Performance Limits
// ============================================================================

/**
 * Performance limits constants
 */
export const PERFORMANCE_LIMITS = {
  maxConcurrent: {
    min: 1,
    max: 20,
    default: 5
  },
  batchSize: {
    min: 10,
    max: 100,
    default: 50
  }
} as const;
