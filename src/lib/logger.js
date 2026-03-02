// bAInder Logger utility
// Stage 10: toggleable debug logging

class Logger {
  constructor() {
    this._enabled = localStorage.getItem('bAInder:debug') === 'true';
  }

  setEnabled(val) {
    this._enabled = !!val;
    localStorage.setItem('bAInder:debug', val ? 'true' : 'false');
  }

  isEnabled() { return this._enabled; }

  log(...args)   { if (this._enabled) console.log('[bAInder]', ...args); }
  warn(...args)  { console.warn('[bAInder]', ...args); }
  error(...args) { console.error('[bAInder]', ...args); }
  group(label)   { if (this._enabled) console.group(`[bAInder] ${label}`); }
  groupEnd()     { if (this._enabled) console.groupEnd(); }
  time(label)    { if (this._enabled) console.time(`[bAInder] ${label}`); }
  timeEnd(label) { if (this._enabled) console.timeEnd(`[bAInder] ${label}`); }
}

export const logger = new Logger();
