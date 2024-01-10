/**
 * Manage structured logging in the context of a Lambda function.
 * Note: the log level is controlled by each Lambda function's configuration.
 */
export class LambdaLogger {
  // note: this is needed as long as the Lambda functions don't become reactive to changes to `AWS_LAMBDA_LOG_LEVEL`
  shouldLog = (logLevel: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'): boolean =>
    LOG_LEVELS_PRIORITY[logLevel] >= LOG_LEVELS_PRIORITY[process.env.AWS_LAMBDA_LOG_LEVEL];

  trace = (summary: string, content: object = {}): void => {
    if (this.shouldLog('TRACE')) console.trace({ summary, ...content });
  };

  debug = (summary: string, content: object = {}): void => {
    if (this.shouldLog('DEBUG')) console.debug({ summary, ...content });
  };

  info = (summary: string, content: object = {}): void => {
    if (this.shouldLog('INFO')) console.info({ summary, ...content });
  };

  warn = (summary: string, error: Error | any, content: object = {}): void => {
    if (this.shouldLog('WARN')) console.warn({ summary, ...content, error });
  };

  error = (summary: string, error: Error | any, content: object = {}): void => {
    if (this.shouldLog('ERROR')) console.error({ summary, ...content, error });
  };
}

// levels here are identical to bunyan practices (https://github.com/trentm/node-bunyan#levels)
export const LOG_LEVELS_PRIORITY: Record<string, number> = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60
};
