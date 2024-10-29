import * as DDB from '@aws-sdk/lib-dynamodb';
import { DynamoDB as DDBClient, WriteRequest } from '@aws-sdk/client-dynamodb';
import * as DDBUtils from '@aws-sdk/util-dynamodb';
import { customAlphabet as AlphabetNanoID } from 'nanoid';
const NanoID = AlphabetNanoID('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 25);

import { LambdaLogger } from './lambdaLogger';

/**
 * A wrapper for AWS DynamoDB.
 */
export class DynamoDB {
  client: DDB.DynamoDBDocument;
  protected logger = new LambdaLogger();

  constructor() {
    this.client = DDB.DynamoDBDocument.from(new DDBClient(), {
      marshallOptions: { convertEmptyValues: true, removeUndefinedValues: true, convertClassInstanceToMap: true }
    });
  }

  /**
   * Convert a JSON object from DynamoDB format to simple JSON.
   * @param data the data in DynamoDB's original format to convert in plain objects
   * @param options the options to use to convert the data
   */
  unmarshall(data: Record<string, any>, options?: DDBUtils.unmarshallOptions): Record<string, any> {
    return DDBUtils.unmarshall(data, options);
  }

  /**
   * Returns an IUNID: IDEA's Unique Nano IDentifier, which is an id unique through an AWS region inside an account.
   * Note: no need of an auth check for external uses: the permissions depend from the context in which it's executed.
   * @param project project code
   * @return the IUNID
   */
  async IUNID(project: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    if (!project) throw new Error('Missing project');
    return await this.IUNIDHelper(project, 0, MAX_ATTEMPTS);
  }
  protected async IUNIDHelper(project: string, attempt: number, maxAttempts: number): Promise<string> {
    if (attempt > maxAttempts) throw new Error('Operation failed');

    const id = NanoID();
    const result = `${project}_${id}`;

    try {
      await this.put({
        TableName: 'idea_IUNID',
        Item: { project, id },
        ConditionExpression: 'NOT (#p = :project AND #id = :id)',
        ExpressionAttributeNames: { '#p': 'project', '#id': 'id' },
        ExpressionAttributeValues: { ':project': project, ':id': id }
      });

      return result;
    } catch (err) {
      // ID exists, try again
      await this.IUNIDHelper(project, attempt + 1, maxAttempts);
    }
  }

  /**
   * Manage atomic counters (atomic autoincrement values) in IDEA's projects.
   * They key of an atomic counter should be composed as the following: `DynamoDBTableName_uniqueKey`.
   * @param key the key of the counter
   */
  async getAtomicCounterByKey(key: string): Promise<number> {
    this.logger.trace(`Get atomic counter for ${key}`);
    const { Attributes } = await this.update({
      TableName: 'idea_atomicCounters',
      Key: { key },
      UpdateExpression: 'ADD atomicCounter :increment',
      ExpressionAttributeValues: { ':increment': 1 },
      ReturnValues: 'UPDATED_NEW'
    });

    if (!Attributes.atomicCounter) throw new Error('Operation failed');
    return Attributes.atomicCounter;
  }

  /**
   * Get an item of a DynamoDB table.
   * @param params the params to apply to DynamoDB's function
   */
  async get(params: DDB.GetCommandInput): Promise<any> {
    this.logger.trace(`Get ${params.TableName}`);
    const { Item } = await this.client.get(params);

    if (!Item) throw new Error('Not found');
    return Item;
  }

  /**
   * Put an item in a DynamoDB table.
   * @param params the params to apply to DynamoDB's function
   */
  async put(params: DDB.PutCommandInput): Promise<DDB.PutCommandOutput> {
    this.logger.trace(`Put ${params.TableName}`);
    return await this.client.put(params);
  }

  /**
   * Update an item of a DynamoDB table.
   * @param params the params to apply to DynamoDB's function
   */
  async update(params: DDB.UpdateCommandInput): Promise<DDB.UpdateCommandOutput> {
    this.logger.trace(`Update ${params.TableName}`);
    return await this.client.update(params);
  }

  /**
   * Delete an item of a DynamoDB table.
   * @param params the params to apply to DynamoDB's function
   */
  async delete(params: DDB.DeleteCommandInput): Promise<DDB.DeleteCommandOutput> {
    this.logger.trace(`Delete ${params.TableName}`);
    return await this.client.delete(params);
  }

  /**
   * Get group of items based on their keys from DynamoDB table, avoiding the limits of DynamoDB's BatchGetItem.
   * @param table the target DynamoDB table
   * @param keys the keys of the objects to retrieve
   * @param ignoreErr if set, ignore the errors and continue the bulk op.
   */
  async batchGet(table: string, keys: Record<string, any>[], ignoreErr?: boolean): Promise<any[]> {
    if (!keys.length) {
      this.logger.trace(`Batch get ${table}: no elements to get`);
      return [];
    }

    return await this.batchGetHelper(table, keys, [], Boolean(ignoreErr));
  }
  protected async batchGetHelper(
    table: string,
    keys: Record<string, any>[],
    resultElements: Record<string, any>[],
    ignoreErr: boolean,
    currentChunk = 0,
    chunkSize = 100
  ): Promise<Record<string, any>[]> {
    const batch: DDB.BatchGetCommandInput = {
      RequestItems: {
        [table]: { Keys: keys.slice(currentChunk, currentChunk + chunkSize) }
      }
    };

    this.logger.trace(`Batch get ${table}: ${currentChunk} of ${keys.length}`);

    let result: DDB.BatchGetCommandOutput;
    try {
      result = await this.client.batchGet(batch);
    } catch (err) {
      if (!ignoreErr) throw err;
    }

    if (result) resultElements = resultElements.concat(result.Responses[table]);

    // if there are still chunks to manage, go on recursively
    if (currentChunk + chunkSize < keys.length)
      return await this.batchGetHelper(table, keys, resultElements, ignoreErr, currentChunk + chunkSize, chunkSize);
    // no more chunks to manage: we're done
    else return resultElements;
  }

  /**
   * Put an array of items in a DynamoDB table, avoiding the limits of DynamoDB's BatchWriteItem.
   * In case of errors, it will retry with a random back-off mechanism until the timeout.
   * Therefore, in case of timeout, there may be some elements written and some not.
   * @param table the target DynamoDB table
   * @param items the objects to insert
   */
  async batchPut(table: string, items: Record<string, any>[]): Promise<void> {
    if (!items.length) return this.logger.trace(`Batch write (put) ${table}: no elements to write`);

    await this.batchWriteHelper(table, items, true);
  }
  /**
   * Delete an array of items from a DynamoDB table, avoiding the limits of DynamoDB's BatchWriteItem.
   * In case of errors, it will retry with a random back-off mechanism until the timeout.
   * Therefore, in case of timeout, there may be some elements deleted and some not.
   * @param table the target DynamoDB table
   * @param keys the keys to delete
   */
  async batchDelete(table: string, keys: Record<string, any>[]): Promise<void> {
    if (!keys.length) return this.logger.trace(`Batch write (delete) ${table}: no elements to write`);

    await this.batchWriteHelper(table, keys, false);
  }
  protected async batchWriteHelper(
    table: string,
    itemsOrKeys: Record<string, any>[],
    isPut: boolean,
    currentChunk = 0,
    chunkSize = 25
  ): Promise<void> {
    this.logger.trace(`Batch write (${isPut ? 'put' : 'delete'}) ${table}: ${currentChunk} of ${itemsOrKeys.length}`);

    let requests: WriteRequest[];
    if (isPut)
      requests = itemsOrKeys.slice(currentChunk, currentChunk + chunkSize).map(i => ({ PutRequest: { Item: i } }));
    // isDelete
    else requests = itemsOrKeys.slice(currentChunk, currentChunk + chunkSize).map(k => ({ DeleteRequest: { Key: k } }));

    const batch: DDB.BatchWriteCommandInput = { RequestItems: { [table]: requests } };
    await this.batchWriteChunkWithRetries(table, batch);

    // if there are still chunks to manage, go on recursively
    if (currentChunk + chunkSize < itemsOrKeys.length)
      await this.batchWriteHelper(table, itemsOrKeys, isPut, currentChunk + chunkSize, chunkSize);
  }
  protected async batchWriteChunkWithRetries(table: string, params: DDB.BatchWriteCommandInput): Promise<void> {
    const getRandomInt = (max: number): number => Math.floor(Math.random() * max);
    const wait = (seconds: number): Promise<void> => new Promise(x => setTimeout((): void => x(), seconds * 1000));

    let attempts = 0;
    do {
      const response = await this.client.batchWrite(params);

      if (
        response.UnprocessedItems &&
        response.UnprocessedItems[table] &&
        response.UnprocessedItems[table].length > 0
      ) {
        params.RequestItems = response.UnprocessedItems;
        attempts++;

        const waitSeconds = getRandomInt(attempts * 5);
        this.logger.trace(`Batch write throttled: waiting ${waitSeconds} seconds to retry`);
        await wait(waitSeconds);
      } else {
        params.RequestItems = null;
      }
    } while (params.RequestItems);
  }

  /**
   * Query a DynamoDB table, avoiding the limits of DynamoDB's Query.
   * @param params the params to apply to DynamoDB's function
   */
  async query(params: DDB.QueryCommandInput): Promise<any[]> {
    this.logger.trace(`Query ${params.TableName}`);
    const result = await this.queryScanHelper(params, [], true);

    this.logger.trace(`Results query ${params.TableName}: ${result.length ?? 0}`);
    return result;
  }
  /**
   * Scan a DynamoDB table, avoiding the limits of DynamoDB's Query.
   * @param params the params to apply to DynamoDB's function
   */
  async scan(params: DDB.ScanCommandInput): Promise<any[]> {
    this.logger.trace(`Scan ${params.TableName}`);
    const result = await this.queryScanHelper(params, [], false);

    this.logger.trace(`Results scan ${params.TableName}: ${result.length ?? 0}`);
    return result;
  }
  protected async queryScanHelper(
    params: DDB.QueryCommandInput | DDB.ScanCommandInput,
    items: Record<string, any>[],
    isQuery: boolean
  ): Promise<Record<string, any>[]> {
    let result;
    if (isQuery) result = await this.client.query(params);
    else result = await this.client.scan(params);

    items = items.concat(result.Items);

    if (result.LastEvaluatedKey) {
      params.ExclusiveStartKey = result.LastEvaluatedKey;
      return await this.queryScanHelper(params, items, isQuery);
    } else return items;
  }

  /**
   * Query a DynamoDB table in the traditional way (no pagination or data mapping).
   * @param params the params to apply to DynamoDB's function
   */
  async queryClassic(params: DDB.QueryCommandInput): Promise<DDB.QueryCommandOutput> {
    this.logger.trace(`Query classic ${params.TableName}`);
    const result = await this.client.query(params);

    this.logger.trace(`Results query classic ${params.TableName}: ${result.Items.length ?? 0}`);
    return result;
  }
  /**
   * Scan a DynamoDB table in the traditional way (no pagination or data mapping).
   * @param params the params to apply to DynamoDB's function
   */
  async scanClassic(params: DDB.ScanCommandInput): Promise<DDB.ScanCommandOutput> {
    this.logger.trace(`Scan classic ${params.TableName}`);
    const result = await this.client.scan(params);

    this.logger.trace(`Results scan classic ${params.TableName}: ${result.Items.length ?? 0}`);
    return result;
  }

  /**
   * Execute a series of write operations in a single transaction.
   * @param ops the operations to execute in the transaction
   */
  async transactWrites(ops: { ConditionCheck?: any; Put?: any; Delete?: any; Update?: any }[]): Promise<void> {
    if (!ops.length) return this.logger.trace('Transaction writes: no elements to write');

    this.logger.trace('Transaction writes');
    await this.client.transactWrite({ TransactItems: ops });
  }
}
