import { DynamoDBRecord } from 'aws-lambda';

import { GenericController } from './genericController';

/**
 * An abstract class to inherit to manage AWS DDB streams in an AWS Lambda function.
 */
export abstract class StreamController extends GenericController {
  records: any[];

  constructor(event: any) {
    super(event);
    this.records = event.Records ?? [];
  }

  protected abstract handleRecord(record: DynamoDBRecord): Promise<void>;

  async handleRequest(): Promise<void> {
    this.logger.info('START', { streamOfRecords: this.records.length ?? 0 });
    try {
      await Promise.all(this.records.map(record => this.handleRecord(record)));
      return this.done();
    } catch (err) {
      return this.done(this.handleControllerError(err, 'STREAM-ERROR', 'Operation failed'));
    }
  }
}
