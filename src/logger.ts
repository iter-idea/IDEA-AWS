/**
 * Manage structured logging.
 */
export class Logger {
  level: string;
  private originalLevel: string;

  constructor({ level = process.env.LOG_LEVEL } = {}) {
    this.level = (level || 'DEBUG').toUpperCase();
    this.originalLevel = this.level;
  }

  isEnabled(level: number): boolean {
    return level >= ((LogLevels as any)[this.level] || LogLevels.DEBUG);
  }

  appendError(params: any, err: Error): any {
    if (!err) return params;

    return { ...(params || {}), errorName: err.name, errorMessage: err.message, stackTrace: err.stack };
  }

  log(levelName: string, message: string, params: any): void {
    const level = (LogLevels as any)[levelName];
    if (!this.isEnabled(level)) return;

    const logMsg = { ...params, level, sLevel: levelName, message };

    const consoleMethods = { DEBUG: console.debug, INFO: console.info, WARN: console.warn, ERROR: console.error };

    // re-order message and params to appear earlier in the log row
    (consoleMethods as any)[levelName](
      JSON.stringify({ message, ...params, ...logMsg }, (_, value) =>
        typeof value === 'bigint' ? value.toString() : value
      )
    );
  }

  debug(msg: string, params: any = {}): void {
    this.log('DEBUG', msg, params);
  }
  info(msg: string, params: any = {}): void {
    this.log('INFO', msg, params);
  }
  warn(msg: string, err: Error | any, params: any = {}): void {
    const parameters = this.appendError(params, err);
    this.log('WARN', msg, parameters);
  }
  error(msg: string, err: Error | any, params: any = {}): void {
    const parameters = this.appendError(params, err);
    this.log('ERROR', msg, parameters);
  }

  enableDebug(): () => void {
    this.level = 'DEBUG';
    return (): void => this.resetLevel();
  }

  resetLevel(): void {
    this.level = this.originalLevel;
  }
}

// levels here are identical to bunyan practices (https://github.com/trentm/node-bunyan#levels)
const LogLevels = { DEBUG: 20, INFO: 30, WARN: 40, ERROR: 50 };
