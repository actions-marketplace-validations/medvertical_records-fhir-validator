/**
 * Engine Logger
 *
 * Module-level logger interface for the records-validator engine. Lets
 * the engine emit diagnostics without binding directly to the server's
 * Winston logger — a precondition for extracting the engine into a
 * standalone npm package (S-2 in the validation-engine roadmap).
 *
 * ## Wiring
 *
 * Engine modules import the singleton `logger` from this file. By
 * default it forwards only errors to a console-backed implementation. Embedders call
 * `setEngineLogger()` once during boot to route logging through their own
 * Winston/pino/etc. instance:
 *
 * ```ts
 * import { setEngineLogger } from '@records-fhir/validator';
 * setEngineLogger(appLogger);
 * ```
 *
 * The engine never reaches into server code; this file is the entire
 * coupling boundary for logging.
 */

/**
 * Minimal logger contract the engine relies on. Designed to be
 * trivially satisfied by Winston, pino, console, or a noop logger —
 * the second argument is intentionally untyped to accept the variety
 * of meta payloads existing engine call sites emit (Error instances,
 * plain objects, scalars).
 */
export interface EngineLogger {
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string | Error, meta?: unknown): void;
}

export type EngineLogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVEL_ORDER: Record<Exclude<EngineLogLevel, 'silent'>, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
};

const DEFAULT_CONSOLE_LOG_LEVEL: EngineLogLevel = 'error';

function normalizeLogLevel(value: string | undefined): EngineLogLevel | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'warning') return 'warn';
    return ['silent', 'error', 'warn', 'info', 'debug'].includes(normalized)
        ? normalized as EngineLogLevel
        : undefined;
}

function readDefaultConsoleLogLevel(): EngineLogLevel {
    return normalizeLogLevel(process.env.RECORDS_FHIR_VALIDATOR_LOG_LEVEL)
        ?? normalizeLogLevel(process.env.RECORDS_VALIDATOR_LOG_LEVEL)
        ?? DEFAULT_CONSOLE_LOG_LEVEL;
}

function shouldLog(level: EngineLogLevel, method: Exclude<EngineLogLevel, 'silent'>): boolean {
    return level !== 'silent' && LOG_LEVEL_ORDER[method] <= LOG_LEVEL_ORDER[level];
}

function createConsoleLogger(): EngineLogger {
    const level = readDefaultConsoleLogLevel();
    return {
        debug: (message, meta) => {
            if (!shouldLog(level, 'debug')) return;
            if (meta !== undefined) console.debug(message, meta);
            else console.debug(message);
        },
        info: (message, meta) => {
            if (!shouldLog(level, 'info')) return;
            if (meta !== undefined) console.info(message, meta);
            else console.info(message);
        },
        warn: (message, meta) => {
            if (!shouldLog(level, 'warn')) return;
            if (meta !== undefined) console.warn(message, meta);
            else console.warn(message);
        },
        error: (message, meta) => {
            if (!shouldLog(level, 'error')) return;
            if (meta !== undefined) console.error(message, meta);
            else console.error(message);
        },
    };
}

let activeLogger: EngineLogger = createConsoleLogger();

/**
 * Replace the engine's underlying logger. Intended to be called once
 * during embedder bootstrap. Calling more than once is supported but
 * not expected in production — later writes simply replace earlier
 * ones.
 */
export function setEngineLogger(next: EngineLogger): void {
    activeLogger = next;
}

/**
 * The shared logger every engine module imports. Delegates to whatever
 * `setEngineLogger` last installed (or the filtered console default when an
 * embedder hasn't wired anything up). Set RECORDS_FHIR_VALIDATOR_LOG_LEVEL
 * or RECORDS_VALIDATOR_LOG_LEVEL to silent, error, warn, info, or debug to
 * adjust that default console logger.
 *
 * The wrapper is created once and re-reads `activeLogger` on every
 * call, so installing a logger after engine modules have already
 * captured `logger` still routes correctly.
 */
export const logger: EngineLogger = {
    debug: (message, meta) => activeLogger.debug(message, meta),
    info: (message, meta) => activeLogger.info(message, meta),
    warn: (message, meta) => activeLogger.warn(message, meta),
    error: (message, meta) => activeLogger.error(message, meta),
};
