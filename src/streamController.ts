import { DynamoDBRecord } from 'aws-lambda';

import { GenericController } from './genericController';

/**
 * An abstract class to inherit to manage AWS DDB streams in an AWS Lambda function.
 */
export abstract class StreamController extends GenericController {
  records: any[];

  constructor(event: any, callback: any) {
    super(event, callback);
    this.records = event.Records ?? [];
  }

  protected abstract handleRecord(record: DynamoDBRecord): Promise<void>;

  async handleRequest(): Promise<void> {
    this.logger.info('START', { streamOfRecords: this.records.length ?? 0 });

    await Promise.all(this.records.map(record => this.handleRecord(record)))
      .then((): void => this.done())
      .catch((err: Error): void => this.done(this.handleControllerError(err, 'STREAM-ERROR', 'Operation failed')));
  }
}
