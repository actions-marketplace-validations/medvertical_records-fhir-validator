/**
 * Stable internal facade for slice utility capabilities.
 *
 * Keep slicing consumers on this module while each implementation family
 * remains independently maintainable and testable.
 */

export * from './slice-binding-code-matching';
export * from './slice-canonical-matching';
export * from './slice-constraint-values';
export * from './slice-fixed-value-matching';
export * from './slice-path-resolution';
export * from './slice-pattern-matching';
export * from './slice-value-equality';
export * from './slice-value-type';
