/**
 * Compatibility surface for batch helpers. Production callers should import
 * the focused resource-planning, profile-preloading, or warmup module.
 */
export {
  chunkArray,
  deduplicateResources,
  groupResourcesByProfile,
  type DeduplicationResult,
} from './batch-resource-planning';
export { preloadProfiles } from './profile-batch-preloader';
export {
  resetWarmupState,
  warmupProfileCacheFromDatabase,
} from './profile-cache-warmup';
