/**
 * bAInder Logger
 *
 * Level hierarchy (lower = more verbose):
 *   ALL   -1  — enable every output channel
 *   DEBUG  0  — verbose debug output (group/time helpers)
 *   INFO   1  — general operational messages  (default)
 *   WARN   2  — warnings
 *   ERROR  3  — errors
 *   OFF    4  — silence everything
 *
 * Persisted in localStorage under the key 'bAInder:logLevel'.
 * Falls back to 'INFO' when no stored value is present.
 */

const LEVELS = { ALL: -1, DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, OFF: 4 };
const LEVEL_NAMES = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF'];
const STORAGE_KEY = 'bAInder:logLevel';
const PREFIX = '[bAInder]';

function _resolveLevel(raw) {
  const upper = String(raw).toUpperCase();
  return (upper in LEVELS) ? upper : 'INFO';
}

class Logger {
  constructor() {
    const stored = typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY)
      : null;
    this._level = _resolveLevel(stored ?? 'INFO');
  }

  // ── Configuration ────────────────────────────────────────────────────────

  /** Set log level. Accepts 'ALL' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'OFF' (case-insensitive). */
  setLevel(level) {
    this._level = _resolveLevel(level);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, this._level);
    }
  }

  /** Returns the current level string, e.g. 'INFO'. */
  getLevel() { return this._level; }

  /** Returns the numeric value of the current level. */
  getLevelValue() { return LEVELS[this._level]; }

  /** Ordered list of valid level names for UI population. */
  static get LEVELS() { return LEVEL_NAMES; }

  // ── Backward-compat shims (boolean toggle) ───────────────────────────────

  /** @deprecated Use setLevel('DEBUG') / setLevel('INFO') instead. */
  setEnabled(val) { this.setLevel(val ? 'DEBUG' : 'INFO'); }

  /** @deprecated Use getLevel() instead. Returns true when level is DEBUG. */
  isEnabled() { return this._level === 'DEBUG'; }

  // ── Logging methods ──────────────────────────────────────────────────────

  /** DEBUG — verbose debug messages. */
  debug(...args) {
    if (LEVELS[this._level] <= LEVELS.DEBUG) console.debug(PREFIX, '[DEBUG]', ...args);
  }

  /** INFO — general operational messages. */
  info(...args) {
    if (LEVELS[this._level] <= LEVELS.INFO) console.info(PREFIX, '[INFO]', ...args);
  }

  /** Alias for info() — backward compat. */
  log(...args) { this.info(...args); }

  /** WARN — unexpected but recoverable conditions. */
  warn(...args) {
    if (LEVELS[this._level] <= LEVELS.WARN) console.warn(PREFIX, '[WARN]', ...args);
  }

  /** ERROR — failures that need attention. */
  error(...args) {
    if (LEVELS[this._level] <= LEVELS.ERROR) console.error(PREFIX, '[ERROR]', ...args);
  }

  // ── Group / timing helpers (gated at DEBUG) ─────────────────────────────

  group(label) {
    if (LEVELS[this._level] <= LEVELS.DEBUG) console.group(`${PREFIX} ${label}`);
  }

  groupEnd() {
    if (LEVELS[this._level] <= LEVELS.DEBUG) console.groupEnd();
  }

  time(label) {
    if (LEVELS[this._level] <= LEVELS.DEBUG) console.time(`${PREFIX} ${label}`);
  }

  timeEnd(label) {
    if (LEVELS[this._level] <= LEVELS.DEBUG) console.timeEnd(`${PREFIX} ${label}`);
  }
}

export const logger = new Logger();
