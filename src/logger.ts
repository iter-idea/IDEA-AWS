/**
 * Manage structured logging in the context of a Lambda function.
 * Note: the log level is controlled by each Lambda function's configuration.
 */
export class Logger {
  debug = (_: string, params: any = {}): void => console.debug({ _, ...params });

  info = (_: string, params: any = {}): void => console.info({ _, ...params });

  warn = (_: string, err: Error | any, params: any = {}): void =>
    console.warn({ _, ...params, errorType: err.name, errorMessage: err.message, stackTrace: err.stack });

  error = (_: string, err: Error | any, params: any = {}): void =>
    console.error({ _, ...params, errorType: err.name, errorMessage: err.message, stackTrace: err.stack });
}
