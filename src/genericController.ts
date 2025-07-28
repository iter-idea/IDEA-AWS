import 'source-map-support/register';

import { LambdaLogger } from './lambdaLogger';

/**
 * An abstract class to inherit to manage some resources with an AWS Lambda function.
 */
export abstract class GenericController {
  protected event: any;

  protected logger = new LambdaLogger();

  /**
   * Initialize a new GenericController helper object.
   * @param event the event that invoked the AWS lambda function
   */
  constructor(event: any) {
    this.event = event;
  }

  /**
   * The main function (to override), that handles the request and must terminate invoking the method `done`.
   */
  async handleRequest(): Promise<any> {
    this.logger.info('START');
    return this.done();
  }

  /**
   * Default ending function for the Lambda.
   */
  protected done(error: Error | any = null, res?: any): any {
    if (error) {
      if ((error as UnhandledError).unhandled) this.logger.error('END-FAILED', error);
      else this.logger.warn('END-FAILED', error);
      throw error;
    } else {
      this.logger.info('END-SUCCESS');
      return res;
    }
  }

  /**
   * Remap an error to manage the logging and make sure no unhandled error is returned to the requester.
   */
  protected handleControllerError(
    err: Error | HandledError | any,
    interceptedInContext: string,
    replaceWithMessage: string
  ): HandledError | UnhandledError {
    if (err instanceof HandledError) return err;
    const error = err as UnhandledError;
    error.unhandled = interceptedInContext;
    error.internalMessage = error.message;
    error.message = replaceWithMessage;
    return error;
  }

  /**
   * Get the current log level for the current Lambda function's `logger`.
   * Note: "FATAL" means that no log will be printed.
   */
  getLambdaLogLevel(): 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' {
    return process.env.AWS_LAMBDA_LOG_LEVEL as any;
  }
  /**
   * Set the log level for the current Lambda function's `logger`.
   */
  setLambdaLogLevel(logLevel: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL'): void {
    process.env.AWS_LAMBDA_LOG_LEVEL = logLevel;
  }
  /**
   * Raise the log level of the current Lambda function's `logger` to "FATAL", hence avoiding printing any log.
   */
  silentLambdaLogs(): void {
    process.env.AWS_LAMBDA_LOG_LEVEL = 'FATAL';
  }
}

/**
 * A specific type of error in the context of the Controller, to distinguish from "unhandled" errors.
 */
export class HandledError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, HandledError.prototype);
  }
}

/**
 * An unhandled error thrown inside the controller (i.e. `!(error instanceof HandledError)`) .
 */
export class UnhandledError extends Error {
  /**
   * The context where the unhandled error was intercepted.
   */
  unhandled: string;
  /**
   * The original error message before it was replaced by a public-facing message.
   */
  internalMessage: string;
}
