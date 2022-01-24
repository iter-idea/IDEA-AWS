import { GenericController, GenericControllerOptions } from './genericController';

import { Logger } from './logger';
const logger = new Logger();

/**
 * An abstract class to inherit to manage AWS DDB streams in an AWS Lambda function.
 */
export abstract class StreamController extends GenericController {
  records: any[];

  constructor(event: any, callback: any, options: GenericControllerOptions = {}) {
    super(event, callback, options);

    this.records = event.Records || [];

    logger.info(`START STREAM: ${this.records.length || 0} records`);
  }
}
