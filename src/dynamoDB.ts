import * as DDB from '@aws-sdk/lib-dynamodb';
import { DynamoDB as DDBClient, AttributeValue, WriteRequest, TransactWriteItem } from '@aws-sdk/client-dynamodb';
import * as DDBUtils from '@aws-sdk/util-dynamodb';
import { v4 as UUIDV4 } from 'uuid';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { customAlphabet as AlphabetNanoID } from 'nanoid';
const NanoID = AlphabetNanoID('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 25);
import { characters as ShortIdCharacters, generate as ShortIdGenerate } from 'shortid';

import { Logger } from './logger';

/**
 * A wrapper for AWS DynamoDB.
 */
export class DynamoDB {
  protected dynamo: DDB.DynamoDBDocument;
  logger = new Logger();

  constructor(options: { debug: boolean } = { debug: true }) {
    this.dynamo = DDB.DynamoDBDocument.from(new DDBClient(), {
      marshallOptions: { convertEmptyValues: true, removeUndefinedValues: true, convertClassInstanceToMap: true }
    });

    this.logger.level = options.debug ? 'DEBUG' : 'INFO';
  }

  /**
   * Convert a JSON object from DynamoDB format to simple JSON.
   * @data the data in DynamoDB's original format to convert in plain objects
   * @options the options to use to convert the data
   */
  unmarshall(data: Record<string, AttributeValue>, options?: DDBUtils.unmarshallOptions): Record<string, any> {
    return DDBUtils.unmarshall(data, options);
  }

  /**
   * Returns an IUID: IDEA's Unique IDentifier, which is an id unique through an IDEA's AWS account and region.
   * Note: no need of an auth check for external uses: the permissions depend from the context in which it's executed.
   * @deprecated use IUNID instead (nano version)
   * @param project project code
   * @return the IUID
   */
  async IUID(project: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    if (!project) throw new Error('Missing project');
    return await this.identifiersGeneratorHelper(project, 'IUID', 0, MAX_ATTEMPTS);
  }
  /**
   * Returns an IUNID: IDEA's Unique Nano IDentifier, which is an id unique through an IDEA's AWS account and region.
   * Note: no need of an auth check for external uses: the permissions depend from the context in which it's executed.
   * @param project project code
   * @return the IUNID
   */
  async IUNID(project: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    if (!project) throw new Error('Missing project');
    return await this.identifiersGeneratorHelper(project, 'IUNID', 0, MAX_ATTEMPTS);
  }
  /**
   * Returns an ISID: IDEA's Short IDentifier, which is a short, unique id intended to be used in small namespaces.
   * Note: no need of an auth check for external uses: the permissions depend from the context in which it's executed.
   * @param project project code
   * @return the ISID
   */
  async ISID(project: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    if (!project) throw new Error('Missing project');
    return await this.identifiersGeneratorHelper(project, 'ISID', 0, MAX_ATTEMPTS);
  }
  protected async identifiersGeneratorHelper(
    project: string,
    type: 'IUNID' | 'IUID' | 'ISID',
    attempt: number,
    maxAttempts: number
  ): Promise<string> {
    if (attempt > maxAttempts) throw new Error('Operation failed');

    let id, result;
    switch (type) {
      case 'IUNID':
        id = NanoID();
        result = `${project}_${id}`;
        break;
      case 'IUID':
        id = UUIDV4();
        result = `${project}_${id}`;
        break;
      case 'ISID':
        // avoid _ characters (to avoid concatenation problems with ids) -- it must be anyway 64 chars-long
        ShortIdCharacters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-@');
        id = ShortIdGenerate();
        result = id;
        break;
    }

    try {
      await this.put({
        TableName: 'idea_'.concat(type),
        Item: { project, id },
        ConditionExpression: 'NOT (#p = :project AND #id = :id)',
        ExpressionAttributeNames: { '#p': 'project', '#id': 'id' },
        ExpressionAttributeValues: { ':project': project, ':id': id }
      });

      return result;
    } catch (err) {
      // ID exists, try again
      await this.identifiersGeneratorHelper(project, type, attempt + 1, maxAttempts);
    }
  }

  /**
   * Manage atomic counters (atomic autoincrement values) in IDEA's projects.
   * They key of an atomic counter should be composed as the following: `DynamoDBTableName_uniqueKey`.
   * @param key the key of the counter
   */
  async getAtomicCounterByKey(key: string): Promise<number> {
    this.logger.debug(`Get atomic counter for ${key}`);
    const result = await this.update({
      TableName: 'idea_atomicCounters',
      Key: { key },
      UpdateExpression: 'ADD atomicCounter :increment',
      ExpressionAttributeValues: { ':increment': 1 },
      ReturnValues: 'UPDATED_NEW'
    });

    if (!result?.Attributes?.atomicCounter) throw new Error('Operation failed');
    else return result.Attributes.atomicCounter;
  }

  /**
   * Get an item of a DynamoDB table.
   * @param params the params to apply to DynamoDB's function
   */
  async get(params: DDB.GetCommandInput): Promise<any> {
    this.logger.debug(`Get ${params.TableName}`);
    const result = await this.dynamo.get(params);

    if (!result?.Item) throw new Error('Not found');
    return result.Item;
  }

  /**
   * Put an item in a DynamoDB table.
   * @param params the params to apply to DynamoDB's function
   */
  async put(params: DDB.PutCommandInput): Promise<DDB.PutCommandOutput> {
    this.logger.debug(`Put ${params.TableName}`);
    return await this.dynamo.put(params);
  }

  /**
   * Update an item of a DynamoDB table.
   * @param params the params to apply to DynamoDB's function
   */
  async update(params: DDB.UpdateCommandInput): Promise<DDB.UpdateCommandOutput> {
    this.logger.debug(`Update ${params.TableName}`);
    return await this.dynamo.update(params);
  }

  /**
   * Delete an item of a DynamoDB table.
   * @param params the params to apply to DynamoDB's function
   */
  async delete(params: DDB.DeleteCommandInput): Promise<DDB.DeleteCommandOutput> {
    this.logger.debug(`Delete ${params.TableName}`);
    return await this.dynamo.delete(params);
  }

  /**
   * Get group of items based on their keys from DynamoDB table, avoiding the limits of DynamoDB's BatchGetItem.
   * @param table the target DynamoDB table
   * @param keys the keys of the objects to retrieve
   * @param ignoreErr if set, ignore the errors and continue the bulk op.
   */
  async batchGet(table: string, keys: Record<string, AttributeValue>[], ignoreErr?: boolean): Promise<any[]> {
    if (!keys.length) {
      this.logger.debug(`Batch get ${table}: no elements to get`);
      return [];
    }

    return await this.batchGetHelper(table, keys, [], Boolean(ignoreErr));
  }
  protected async batchGetHelper(
    table: string,
    keys: Record<string, AttributeValue>[],
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

    this.logger.debug(`Batch get ${table}: ${currentChunk} of ${keys.length}`);

    let result: DDB.BatchGetCommandOutput;
    try {
      result = await this.dynamo.batchGet(batch);
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
    if (!items.length) return this.logger.debug(`Batch write (put) ${table}: no elements to write`);

    await this.batchWriteHelper(table, items, true);
  }
  /**
   * Delete an array of items from a DynamoDB table, avoiding the limits of DynamoDB's BatchWriteItem.
   * In case of errors, it will retry with a random back-off mechanism until the timeout.
   * Therefore, in case of timeout, there may be some elements deleted and some not.
   * @param table the target DynamoDB table
   * @param keys the keys to delete
   */
  async batchDelete(table: string, keys: Record<string, AttributeValue>[]): Promise<void> {
    if (!keys.length) return this.logger.debug(`Batch write (delete) ${table}: no elements to write`);

    await this.batchWriteHelper(table, keys, false);
  }
  protected async batchWriteHelper(
    table: string,
    itemsOrKeys: Record<string, any>[] | Record<string, AttributeValue>[],
    isPut: boolean,
    currentChunk = 0,
    chunkSize = 25
  ): Promise<void> {
    this.logger.debug(`Batch write (${isPut ? 'put' : 'delete'}) ${table}: ${currentChunk} of ${itemsOrKeys.length}`);

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
      const response = await this.dynamo.batchWrite(params);

      if (
        response.UnprocessedItems &&
        response.UnprocessedItems[table] &&
        response.UnprocessedItems[table].length > 0
      ) {
        params.RequestItems = response.UnprocessedItems;
        attempts++;

        const waitSeconds = getRandomInt(attempts * 5);
        this.logger.debug(`Batch write throttled: waiting ${waitSeconds} seconds to retry`);
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
    this.logger.debug(`Query ${params.TableName}`);
    const result = await this.queryScanHelper(params, [], true);

    this.logger.debug(`Results query ${params.TableName}: ${result?.length || 0}`);
    return result;
  }
  /**
   * Scan a DynamoDB table, avoiding the limits of DynamoDB's Query.
   * @param params the params to apply to DynamoDB's function
   */
  async scan(params: DDB.ScanCommandInput): Promise<any[]> {
    this.logger.debug(`Scan ${params.TableName}`);
    const result = await this.queryScanHelper(params, [], false);

    this.logger.debug(`Results scan ${params.TableName}: ${result?.length || 0}`);
    return result;
  }
  protected async queryScanHelper(
    params: DDB.QueryCommandInput | DDB.ScanCommandInput,
    items: Record<string, any>[],
    isQuery: boolean
  ): Promise<Record<string, any>[]> {
    let result;
    if (isQuery) result = await this.dynamo.query(params);
    else result = await this.dynamo.scan(params);

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
    this.logger.debug(`Query classic ${params.TableName}`);
    const result = await this.dynamo.query(params);

    this.logger.debug(`Results query classic ${params.TableName}: ${result?.Items?.length || 0}`);
    return result;
  }
  /**
   * Scan a DynamoDB table in the traditional way (no pagination or data mapping).
   * @param params the params to apply to DynamoDB's function
   */
  async scanClassic(params: DDB.ScanCommandInput): Promise<DDB.ScanCommandOutput> {
    this.logger.debug(`Scan classic ${params.TableName}`);
    const result = await this.dynamo.scan(params);

    this.logger.debug(`Results scan classic ${params.TableName}: ${result?.Items?.length || 0}`);
    return result;
  }

  /**
   * Execute a series of max 10 write operations in a single transaction.
   * @param ops the operations to execute in the transaction
   */
  async transactWrites(ops: TransactWriteItem[]): Promise<void> {
    if (!ops.length) return this.logger.debug('Transaction writes: no elements to write');

    this.logger.debug('Transaction writes');
    await this.dynamo.transactWrite({ TransactItems: ops.slice(0, 10) });
  }
}
