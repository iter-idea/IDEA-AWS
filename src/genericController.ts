import 'source-map-support/register';

import { Logger } from './logger';

/**
 * An abstract class to inherit to manage some resources with an AWS Lambda function.
 */
export abstract class GenericController {
  protected event: any;
  protected callback: any;

  protected logger = new Logger();

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
  protected done(err: any, res?: any): void {
    if (err) this.logger.info('END-FAILED', { error: err.message || err.errorMessage });
    else this.logger.info('END-SUCCESS');

    this.callback(err, res);
  }
}
