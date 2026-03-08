/**
 * Tests for src/lib/utils/logger.js
 */

import { vi } from 'vitest';
import { logger } from '../src/lib/utils/logger.js';

const STORAGE_KEY = 'bAInder:logLevel';

describe('Logger', () => {
  let spyDebug, spyInfo, spyWarn, spyError, spyGroup, spyGroupEnd, spyTime, spyTimeEnd;

  beforeEach(() => {
    spyDebug    = vi.spyOn(console, 'debug').mockImplementation(() => {});
    spyInfo     = vi.spyOn(console, 'info').mockImplementation(() => {});
    spyWarn     = vi.spyOn(console, 'warn').mockImplementation(() => {});
    spyError    = vi.spyOn(console, 'error').mockImplementation(() => {});
    spyGroup    = vi.spyOn(console, 'group').mockImplementation(() => {});
    spyGroupEnd = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    spyTime     = vi.spyOn(console, 'time').mockImplementation(() => {});
    spyTimeEnd  = vi.spyOn(console, 'timeEnd').mockImplementation(() => {});
    localStorage.clear();
    logger.setLevel('INFO'); // reset to default
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Configuration ─────────────────────────────────────────────────────────

  describe('setLevel / getLevel', () => {
    it('defaults to INFO', () => {
      expect(logger.getLevel()).toBe('INFO');
    });

    it('sets level to DEBUG', () => {
      logger.setLevel('DEBUG');
      expect(logger.getLevel()).toBe('DEBUG');
    });

    it('sets level to WARN', () => {
      logger.setLevel('WARN');
      expect(logger.getLevel()).toBe('WARN');
    });

    it('sets level to ERROR', () => {
      logger.setLevel('ERROR');
      expect(logger.getLevel()).toBe('ERROR');
    });

    it('sets level to ALL', () => {
      logger.setLevel('ALL');
      expect(logger.getLevel()).toBe('ALL');
    });

    it('sets level to OFF', () => {
      logger.setLevel('OFF');
      expect(logger.getLevel()).toBe('OFF');
    });

    it('is case-insensitive', () => {
      logger.setLevel('warn');
      expect(logger.getLevel()).toBe('WARN');
    });

    it('falls back to INFO for unknown level', () => {
      logger.setLevel('UNKNOWN_LEVEL');
      expect(logger.getLevel()).toBe('INFO');
    });

    it('persists level to localStorage', () => {
      logger.setLevel('WARN');
      expect(localStorage.getItem(STORAGE_KEY)).toBe('WARN');
    });
  });

  describe('getLevelValue', () => {
    it('returns -1 for ALL', () => {
      logger.setLevel('ALL');
      expect(logger.getLevelValue()).toBe(-1);
    });

    it('returns 0 for DEBUG', () => {
      logger.setLevel('DEBUG');
      expect(logger.getLevelValue()).toBe(0);
    });

    it('returns 1 for INFO', () => {
      logger.setLevel('INFO');
      expect(logger.getLevelValue()).toBe(1);
    });

    it('returns 2 for WARN', () => {
      logger.setLevel('WARN');
      expect(logger.getLevelValue()).toBe(2);
    });

    it('returns 3 for ERROR', () => {
      logger.setLevel('ERROR');
      expect(logger.getLevelValue()).toBe(3);
    });

    it('returns 4 for OFF', () => {
      logger.setLevel('OFF');
      expect(logger.getLevelValue()).toBe(4);
    });
  });

  describe('Logger.LEVELS static getter', () => {
    it('returns an array of level names', () => {
      const levels = logger.constructor.LEVELS;
      expect(Array.isArray(levels)).toBe(true);
      expect(levels).toContain('ALL');
      expect(levels).toContain('DEBUG');
      expect(levels).toContain('INFO');
      expect(levels).toContain('OFF');
    });
  });

  // ── Backward-compat shims ────────────────────────────────────────────────

  describe('setEnabled / isEnabled', () => {
    it('setEnabled(true) sets level to DEBUG', () => {
      logger.setEnabled(true);
      expect(logger.getLevel()).toBe('DEBUG');
    });

    it('setEnabled(false) sets level to INFO', () => {
      logger.setEnabled(false);
      expect(logger.getLevel()).toBe('INFO');
    });

    it('isEnabled() returns true when DEBUG', () => {
      logger.setLevel('DEBUG');
      expect(logger.isEnabled()).toBe(true);
    });

    it('isEnabled() returns false when INFO', () => {
      logger.setLevel('INFO');
      expect(logger.isEnabled()).toBe(false);
    });

    it('isEnabled() returns false when ERROR', () => {
      logger.setLevel('ERROR');
      expect(logger.isEnabled()).toBe(false);
    });
  });

  // ── Logging methods (INFO level) ─────────────────────────────────────────

  describe('info() at INFO level', () => {
    it('calls console.info', () => {
      logger.setLevel('INFO');
      logger.info('test message');
      expect(spyInfo).toHaveBeenCalledWith('[bAInder]', '[INFO]', 'test message');
    });
  });

  describe('log() is alias for info()', () => {
    it('calls console.info via log()', () => {
      logger.setLevel('INFO');
      logger.log('test via log');
      expect(spyInfo).toHaveBeenCalledWith('[bAInder]', '[INFO]', 'test via log');
    });
  });

  describe('warn()', () => {
    it('calls console.warn at WARN level', () => {
      logger.setLevel('WARN');
      logger.warn('warning');
      expect(spyWarn).toHaveBeenCalledWith('[bAInder]', '[WARN]', 'warning');
    });

    it('calls console.warn at INFO level (warn >= info)', () => {
      logger.setLevel('INFO');
      logger.warn('warning');
      expect(spyWarn).toHaveBeenCalled();
    });
  });

  describe('error()', () => {
    it('calls console.error at ERROR level', () => {
      logger.setLevel('ERROR');
      logger.error('fatal');
      expect(spyError).toHaveBeenCalledWith('[bAInder]', '[ERROR]', 'fatal');
    });

    it('calls console.error at DEBUG level', () => {
      logger.setLevel('DEBUG');
      logger.error('fatal');
      expect(spyError).toHaveBeenCalled();
    });
  });

  describe('DEBUG()', () => {
    it('calls console.debug at DEBUG level', () => {
      logger.setLevel('DEBUG');
      logger.debug('verbose');
      expect(spyDebug).toHaveBeenCalledWith('[bAInder]', '[DEBUG]', 'verbose');
    });

    it('does NOT call console.debug at INFO level', () => {
      logger.setLevel('INFO');
      logger.debug('verbose');
      expect(spyDebug).not.toHaveBeenCalled();
    });
  });

  // ── ALL level enables everything ───────────────────────────────────────────

  describe('ALL level enables all output', () => {
    beforeEach(() => { logger.setLevel('ALL'); });

    it('DEBUG() passes',    () => { logger.debug('x'); expect(spyDebug).toHaveBeenCalled(); });
    it('info() passes',     () => { logger.info('x');  expect(spyInfo).toHaveBeenCalled();  });
    it('warn() passes',     () => { logger.warn('x');  expect(spyWarn).toHaveBeenCalled();  });
    it('error() passes',    () => { logger.error('x'); expect(spyError).toHaveBeenCalled(); });
    it('group() passes',    () => { logger.group('x'); expect(spyGroup).toHaveBeenCalled(); });
    it('groupEnd() passes', () => { logger.groupEnd(); expect(spyGroupEnd).toHaveBeenCalled(); });
    it('time() passes',     () => { logger.time('x');  expect(spyTime).toHaveBeenCalled();  });
    it('timeEnd() passes',  () => { logger.timeEnd('x'); expect(spyTimeEnd).toHaveBeenCalled(); });
  });

  // ── OFF level silences everything ─────────────────────────────────────────

  describe('OFF level silences all output', () => {
    beforeEach(() => { logger.setLevel('OFF'); });

    it('DEBUG() suppressed', () => { logger.debug('x'); expect(spyDebug).not.toHaveBeenCalled(); });
    it('info() suppressed',  () => { logger.info('x');  expect(spyInfo).not.toHaveBeenCalled();  });
    it('warn() suppressed',  () => { logger.warn('x');  expect(spyWarn).not.toHaveBeenCalled();  });
    it('error() suppressed', () => { logger.error('x'); expect(spyError).not.toHaveBeenCalled(); });
    it('group() suppressed',    () => { logger.group('x');    expect(spyGroup).not.toHaveBeenCalled();    });
    it('groupEnd() suppressed', () => { logger.groupEnd();    expect(spyGroupEnd).not.toHaveBeenCalled(); });
    it('time() suppressed',     () => { logger.time('x');     expect(spyTime).not.toHaveBeenCalled();     });
    it('timeEnd() suppressed',  () => { logger.timeEnd('x');  expect(spyTimeEnd).not.toHaveBeenCalled();  });
  });

  // ── INFO level suppresses DEBUG helpers ──────────────────────────────────

  describe('INFO level suppresses group/time helpers', () => {
    beforeEach(() => { logger.setLevel('INFO'); });

    it('group() not called', () => { logger.group('label'); expect(spyGroup).not.toHaveBeenCalled(); });
    it('groupEnd() not called', () => { logger.groupEnd(); expect(spyGroupEnd).not.toHaveBeenCalled(); });
    it('time() not called', () => { logger.time('label'); expect(spyTime).not.toHaveBeenCalled(); });
    it('timeEnd() not called', () => { logger.timeEnd('label'); expect(spyTimeEnd).not.toHaveBeenCalled(); });
  });

  // ── DEBUG level enables group/time helpers ────────────────────────────────

  describe('DEBUG level enables group/time helpers', () => {
    beforeEach(() => { logger.setLevel('DEBUG'); });

    it('group() calls console.group', () => {
      logger.group('my group');
      expect(spyGroup).toHaveBeenCalledWith('[bAInder] my group');
    });

    it('groupEnd() calls console.groupEnd', () => {
      logger.groupEnd();
      expect(spyGroupEnd).toHaveBeenCalled();
    });

    it('time() calls console.time', () => {
      logger.time('my timer');
      expect(spyTime).toHaveBeenCalledWith('[bAInder] my timer');
    });

    it('timeEnd() calls console.timeEnd', () => {
      logger.timeEnd('my timer');
      expect(spyTimeEnd).toHaveBeenCalledWith('[bAInder] my timer');
    });
  });

  // ── WARN level suppresses INFO but passes WARN/ERROR ─────────────────────

  describe('WARN level filtering', () => {
    beforeEach(() => { logger.setLevel('WARN'); });

    it('info() suppressed', () => { logger.info('x'); expect(spyInfo).not.toHaveBeenCalled(); });
    it('warn() passes',     () => { logger.warn('x'); expect(spyWarn).toHaveBeenCalled(); });
    it('error() passes',    () => { logger.error('x'); expect(spyError).toHaveBeenCalled(); });
  });

  // ── ERROR level only passes error ─────────────────────────────────────────

  describe('ERROR level filtering', () => {
    beforeEach(() => { logger.setLevel('ERROR'); });

    it('info() suppressed', () => { logger.info('x'); expect(spyInfo).not.toHaveBeenCalled(); });
    it('warn() suppressed', () => { logger.warn('x'); expect(spyWarn).not.toHaveBeenCalled(); });
    it('error() passes',    () => { logger.error('x'); expect(spyError).toHaveBeenCalled(); });
  });

  // ── Multiple args ─────────────────────────────────────────────────────────

  describe('passes multiple arguments to console method', () => {
    it('info with multiple args', () => {
      logger.setLevel('INFO');
      logger.info('msg', { key: 'val' }, 42);
      expect(spyInfo).toHaveBeenCalledWith('[bAInder]', '[INFO]', 'msg', { key: 'val' }, 42);
    });

    it('error with multiple args', () => {
      logger.setLevel('ERROR');
      const err = new Error('oops');
      logger.error('Something went wrong', err);
      expect(spyError).toHaveBeenCalledWith('[bAInder]', '[ERROR]', 'Something went wrong', err);
    });
  });
});
