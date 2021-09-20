import { DynamoDB as DDB } from 'aws-sdk';
import { v4 as UUIDV4 } from 'uuid';
import { customAlphabet as AlphabetNanoID } from 'nanoid';
const NanoID = AlphabetNanoID('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 25);
import { characters as ShortIdCharacters, generate as ShortIdGenerate } from 'shortid';
import { logger } from 'idea-toolbox';

// declare libs as global vars to be reused in warm starts by the Lambda function
let ideaWarmStart_ddb: DDB.DocumentClient = null;

/**
 * A wrapper for AWS DynamoDB.
 */
export class DynamoDB {
  protected dynamo: DDB.DocumentClient;

  constructor() {
    if (!ideaWarmStart_ddb) ideaWarmStart_ddb = new DDB.DocumentClient();
    this.dynamo = ideaWarmStart_ddb;
  }

  /**
   * Convert a JSON object from dynamoDB format to simple JSON.
   */
  unmarshall(data: DDB.AttributeMap, options?: DDB.DocumentClient.ConverterOptions): { [key: string]: any } {
    return DDB.Converter.unmarshall(data, options);
  }

  /**
   * Returns an IUID: IDEA's Unique IDentifier, which is an id unique through all IDEA's projects.
   * Note: there's no need of an authorization check for extrernal uses: the permissions depend
   * from the context in which it's executed.
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
   * Returns an IUNID: IDEA's Unique Nano IDentifier, which is an id unique through all IDEA's projects.
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
   * Returns an ISID: IDEA's Short IDentifier, which is a short, unique id through a single project.
   * Note: there's no need of an authorization check for extrernal uses: the permissions depend
   * from the context in which it's executed.
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
    logger(`GET ATOMIC COUNTER FOR ${key}`);
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
   */
  async get(params: DDB.DocumentClient.GetItemInput): Promise<DDB.DocumentClient.AttributeMap | any> {
    logger(`GET ${params.TableName}`);
    const result = await this.dynamo.get(params).promise();

    if (!result?.Item) throw new Error('Not found');
    return result.Item;
  }

  /**
   * Put an item in a DynamoDB table.
   */
  async put(params: DDB.DocumentClient.PutItemInput): Promise<DDB.DocumentClient.PutItemOutput> {
    logger(`PUT ${params.TableName}`);
    return await this.dynamo.put(params).promise();
  }

  /**
   * Update an item of a DynamoDB table.
   */
  async update(params: DDB.DocumentClient.UpdateItemInput): Promise<DDB.DocumentClient.UpdateItemOutput> {
    logger(`UPDATE ${params.TableName}`);
    return await this.dynamo.update(params).promise();
  }

  /**
   * Delete an item of a DynamoDB table.
   */
  async delete(params: DDB.DocumentClient.DeleteItemInput): Promise<DDB.DocumentClient.DeleteItemOutput> {
    logger(`DELETE ${params.TableName}`);
    return await this.dynamo.delete(params).promise();
  }

  /**
   * Get group of items based on their keys from DynamoDb table, avoiding the limits of DynamoDB's BatchGetItem.
   * @param ignoreErr if set, ignore the errors and continue the bulk op.
   */
  async batchGet(
    table: string,
    keys: DDB.DocumentClient.Key[],
    ignoreErr?: boolean
  ): Promise<DDB.DocumentClient.AttributeMap[]> {
    if (!keys.length) {
      logger(`BATCH GET ${table}`, null, 'No elements to get');
      return [];
    }

    await this.batchGetHelper(table, keys, [], Boolean(ignoreErr), 0, 100);
  }
  protected async batchGetHelper(
    table: string,
    keys: DDB.DocumentClient.Key[],
    resultElements: DDB.DocumentClient.AttributeMap[],
    ignoreErr: boolean,
    currentChunk: number,
    chunkSize: number
  ): Promise<DDB.DocumentClient.AttributeMap[]> {
    const batch: any = { RequestItems: {} };
    batch.RequestItems[table] = { Keys: [] };
    batch.RequestItems[table].Keys = keys.slice(currentChunk, currentChunk + chunkSize);

    logger(`BATCH GET ${table}`, null, `${currentChunk} of ${keys.length}`);

    let result;
    try {
      result = await this.dynamo.batchGet(batch).promise();
    } catch (err) {
      if (!ignoreErr) throw err;
    }

    if (result) resultElements = resultElements.concat(result.Responses[table]);

    // if there are still chunks to manage, go on recursively
    if (currentChunk + chunkSize < keys.length)
      await this.batchGetHelper(table, keys, resultElements, ignoreErr, currentChunk + chunkSize, chunkSize);
    // no more chunks to manage: we're done
    return resultElements;
  }

  /**
   * Put an array of items in a DynamoDb table, avoiding the limits of DynamoDB's BatchWriteItem.
   * @param ignoreErr if true, ignore the errors and continue the bulk op
   */
  async batchPut(table: string, items: DDB.DocumentClient.AttributeMap[], ignoreErr?: boolean): Promise<void> {
    if (!items.length) return logger(`BATCH WRITE (PUT) ${table}`, null, 'No elements to write');

    await this.batchWriteHelper(table, items, true, Boolean(ignoreErr), 0, 25);
  }
  /**
   * Delete an array of items from a DynamoDb table, avoiding the limits of DynamoDB's BatchWriteItem.
   * @param ignoreErr if true, ignore the errors and continue the bulk op.
   */
  async batchDelete(table: string, keys: DDB.DocumentClient.Key[], ignoreErr?: boolean): Promise<void> {
    if (!keys.length) return logger(`BATCH WRITE (DELETE) ${table}`, null, 'No elements to write');

    await this.batchWriteHelper(table, keys, false, Boolean(ignoreErr), 0, 25);
  }
  protected async batchWriteHelper(
    table: string,
    items: DDB.DocumentClient.AttributeMap[],
    isPut: boolean,
    ignoreErr: boolean,
    currentChunk: number,
    chunkSize: number
  ): Promise<void> {
    const batch: any = { RequestItems: {} };
    if (isPut) {
      batch.RequestItems[table] = items
        .slice(currentChunk, currentChunk + chunkSize)
        .map(i => ({ PutRequest: { Item: i } }));
    } else {
      // isDelete
      batch.RequestItems[table] = items
        .slice(currentChunk, currentChunk + chunkSize)
        .map(k => ({ DeleteRequest: { Key: k } }));
    }

    logger(`BATCH WRITE (${isPut ? 'PUT' : 'DELETE'}) ${table}`, null, `${currentChunk} of ${items.length}`);

    try {
      await this.dynamo.batchWrite(batch).promise();
    } catch (err) {
      if (!ignoreErr) throw err;
    }

    // if there are still chunks to manage, go on recursively
    if (currentChunk + chunkSize < items.length)
      await this.batchWriteHelper(table, items, isPut, ignoreErr, currentChunk + chunkSize, chunkSize);
    // no more chunks to manage: we're done
    return;
  }

  /**
   * Query a DynamoDb table, avoiding the limits of DynamoDB's Query.
   * @param params the params to apply to DynamoDB's function
   */
  async query(params: DDB.DocumentClient.QueryInput): Promise<DDB.DocumentClient.AttributeMap[]> {
    logger(`Query ${params.TableName}`);
    const result = await this.queryScanHelper(params, [], true);

    logger(`\tResults query ${params.TableName}`, null, result?.length || 0);
    return result;
  }
  /**
   * Scan a DynamoDb table, avoiding the limits of DynamoDB's Query.
   * @param params the params to apply to DynamoDB's function
   */
  async scan(params: DDB.DocumentClient.QueryInput): Promise<DDB.DocumentClient.AttributeMap[]> {
    logger(`Scan ${params.TableName}`);
    const result = await this.queryScanHelper(params, [], false);

    logger(`\tResults scan ${params.TableName}`, null, result?.length || 0);
    return result;
  }
  protected async queryScanHelper(
    params: DDB.DocumentClient.QueryInput | DDB.DocumentClient.ScanInput,
    items: DDB.DocumentClient.AttributeMap[],
    isQuery: boolean
  ): Promise<DDB.DocumentClient.AttributeMap[]> {
    let result;
    if (isQuery) result = await this.dynamo.query(params).promise();
    else result = await this.dynamo.scan(params).promise();

    items = items.concat(result.Items);

    if (result.LastEvaluatedKey) {
      params.ExclusiveStartKey = result.LastEvaluatedKey;
      await this.queryScanHelper(params, items, isQuery);
    } else return items;
  }

  /**
   * Query a DynamoDb table in the traditional way (no pagination or data mapping).
   * @param params the params to apply to DynamoDB's function
   */
  async queryClassic(params: DDB.DocumentClient.QueryInput): Promise<DDB.DocumentClient.QueryOutput> {
    logger(`Query classic ${params.TableName}`);
    const result = await this.dynamo.query(params).promise();

    logger(`\tResults query classic ${params.TableName}`, null, result?.Items?.length || 0);
    return result;
  }
  /**
   * Scan a DynamoDb table in the traditional way (no pagination or data mapping).
   * @param params the params to apply to DynamoDB's function
   */
  async scanClassic(params: DDB.DocumentClient.ScanInput): Promise<DDB.DocumentClient.ScanOutput> {
    logger(`Scan classic ${params.TableName}`);
    const result = await this.dynamo.scan(params).promise();

    logger(`\tResults scan classic ${params.TableName}`, null, result?.Items?.length || 0);
    return result;
  }

  /**
   * Execute a series of max 10 write operations in a single transaction.
   * @param ops the operations to execute in the transaction
   */
  async transactWrites(ops: DDB.DocumentClient.TransactWriteItem[]): Promise<void> {
    if (!ops.length) return logger('TRANSACTION WRITES', null, 'No elements to write');

    logger('TRANSACTION WRITES');
    await this.dynamo.transactWrite({ TransactItems: ops.slice(0, 10) }).promise();
  }

  /**
   * Creates a set of elements (DynamoDB format) inferring the type of set from the type of the first element.
   */
  createSet(array: number[] | string[], options?: DDB.DocumentClient.CreateSetOptions): DDB.DocumentClient.DynamoDbSet {
    return this.dynamo.createSet(array, options);
  }
}
