import { GenericController } from './genericController';

/**
 * An abstract class to inherit to manage AWS DDB streams in an AWS Lambda function.
 */
export abstract class StreamController extends GenericController {
  records: any[];

  constructor(event: any, callback: any) {
    super(event, callback);

    this.records = event.Records ?? [];

    this.logger.info(`START STREAM: ${this.records.length ?? 0} records`);
  }
}
