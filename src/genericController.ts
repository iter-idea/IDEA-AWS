import 'source-map-support/register';

import { LambdaLogger } from './lambdaLogger';

/**
 * An abstract class to inherit to manage some resources with an AWS Lambda function.
 */
export abstract class GenericController {
  protected event: any;
  protected callback: any;

  protected logger = new LambdaLogger();

  /**
   * Initialize a new GenericController helper object.
   * @param event the event that invoked the AWS lambda function
   * @param callback the callback to resolve or reject the execution
   */
  constructor(event: any, callback: any) {
    this.event = event;
    this.callback = callback;
  }

  /**
   * The main function, that handle the request and should terminate with an invokation of the method `done`.
   */
  abstract handleRequest(): void;

  /**
   * Default callback for the Lambda.
   */
  protected done(error: Error | any, res?: any): void {
    if (error) this.logger.error('END-FAILED', error);
    else this.logger.info('END-SUCCESS');

    this.callback(error, res);
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
