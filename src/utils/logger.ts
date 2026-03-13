type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  child(component: string): Logger;
}

export function createLogger(level: LogLevel, component?: string): Logger {
  const minLevel = LEVEL_ORDER[level];

  function log(msgLevel: LogLevel, msg: string, args: unknown[]): void {
    if (LEVEL_ORDER[msgLevel] < minLevel) return;

    const timestamp = new Date().toISOString();
    const prefix = component ? `[${component}]` : '';
    const errorStr = args
      .filter((a) => a instanceof Error)
      .map((e) => `\n${(e as Error).stack ?? (e as Error).message}`)
      .join('');
    const extra = args
      .filter((a) => !(a instanceof Error))
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');

    process.stderr.write(
      `${timestamp} ${msgLevel.toUpperCase().padEnd(5)} ${prefix} ${msg}${extra ? ' ' + extra : ''}${errorStr}\n`,
    );
  }

  return {
    debug: (msg, ...args) => log('debug', msg, args),
    info: (msg, ...args) => log('info', msg, args),
    warn: (msg, ...args) => log('warn', msg, args),
    error: (msg, ...args) => log('error', msg, args),
    child: (name) => createLogger(level, component ? `${component}:${name}` : name),
  };
}
