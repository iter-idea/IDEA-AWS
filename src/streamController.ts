import { logger } from 'idea-toolbox';

import { GenericController, GenericControllerOptions } from './genericController';

/**
 * An abstract class to inherit to manage AWS DDB streams in an AWS Lambda function.
 */
export abstract class StreamController extends GenericController {
  public records: any[];

  constructor(event: any, callback: any, options?: GenericControllerOptions) {
    super(event, callback, options);

    this.records = event.records;

    logger(`START STREAM: ${this.records?.length || 0} records`, null, null, true);
  }
}
