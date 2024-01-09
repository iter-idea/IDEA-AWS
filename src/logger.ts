/**
 * Manage structured logging in the context of a Lambda function.
 * Note: the log level is controlled by each Lambda function's configuration.
 */
export class Logger {
  debug = (summary: string, content: object = {}): void => console.debug({ summary, ...content });

  info = (summary: string, content: object = {}): void => console.info({ summary, ...content });

  warn = (summary: string, error: Error | any, content: object = {}): void =>
    console.warn({ summary, ...content, error });

  error = (summary: string, error: Error | any, content: object = {}): void =>
    console.error({ summary, ...content, error });
}
