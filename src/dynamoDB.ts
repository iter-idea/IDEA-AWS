import UUIDV4 = require('uuid/v4');
import { customAlphabet as AlphabetNanoID } from 'nanoid';
const NanoID = AlphabetNanoID('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 25);
import { DynamoDB as DDB } from 'aws-sdk';
import { characters as ShortIdCharacters, generate as ShortIdGenerate } from 'shortid';
import { logger } from 'idea-toolbox';

/**
 * A wrapper for AWS DynamoDB.
 */
export class DynamoDB {
  protected dynamo: DDB.DocumentClient; // the instance of DynamoDB

  /**
   * Initialize a new DynamoDB helper object.
   */
  constructor() {
    this.dynamo = new DDB.DocumentClient();
  }

  /**
   * Convert a JSON object from dynamoDB format to simple JSON.
   */
  public unmarshall(data: DDB.AttributeMap, options?: DDB.DocumentClient.ConverterOptions): { [key: string]: any } {
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
  public IUID(project: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    return new Promise((resolve, reject) => {
      if (!project) reject();
      else this.iuidHelper(project, 0, MAX_ATTEMPTS, resolve, reject);
    });
  }
  protected iuidHelper(project: string, attempt: number, maxAttempts: number, resolve: any, reject: any) {
    if (attempt > maxAttempts) reject();
    else {
      const id = UUIDV4();
      this.put({
        TableName: 'idea_IUID',
        Item: { project, id },
        ConditionExpression: 'NOT (#p = :project AND #id = :id)',
        ExpressionAttributeNames: { '#p': 'project', '#id': 'id' },
        ExpressionAttributeValues: { ':project': project, ':id': id }
      })
        .then(() => resolve(`${project}_${id}`))
        .catch(() =>
          // ID exists, try again
          this.iuidHelper(project, attempt + 1, maxAttempts, resolve, reject)
        );
    }
  }

  /**
   * Returns an IUNID: IDEA's Unique Nano IDentifier, which is an id unique through all IDEA's projects.
   * Note: no need of an auth check for external uses: the permissions depend from the context in which it's executed.
   * @param project project code
   * @return the IUNID
   */
  public IUNID(project: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    return new Promise((resolve, reject) => {
      if (!project) reject();
      else this.iunidHelper(project, 0, MAX_ATTEMPTS, resolve, reject);
    });
  }
  protected iunidHelper(project: string, attempt: number, maxAttempts: number, resolve: any, reject: any) {
    if (attempt > maxAttempts) reject();
    else {
      const id = NanoID();
      this.put({
        TableName: 'idea_IUNID',
        Item: { project, id },
        ConditionExpression: 'NOT (#p = :project AND #id = :id)',
        ExpressionAttributeNames: { '#p': 'project', '#id': 'id' },
        ExpressionAttributeValues: { ':project': project, ':id': id }
      })
        .then(() => resolve(`${project}_${id}`))
        .catch(() =>
          // ID exists, try again
          this.iunidHelper(project, attempt + 1, maxAttempts, resolve, reject)
        );
    }
  }

  /**
   * Returns an ISID: IDEA's Short IDentifier, which is a short, unique id through a single project.
   * Note: there's no need of an authorization check for extrernal uses: the permissions depend
   * from the context in which it's executed.
   * @param project project code
   * @return the ISID
   */
  public ISID(project: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    // avoid _ characters (to avoid concatenation problems with ids) -- it must be anyway 64 chars-long
    ShortIdCharacters('0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-@');
    return new Promise((resolve, reject) => {
      if (!project) reject();
      else this.isidHelper(project, 0, MAX_ATTEMPTS, resolve, reject);
    });
  }
  protected isidHelper(project: string, attempt: number, maxAttempts: number, resolve: any, reject: any) {
    if (attempt > maxAttempts) reject();
    else {
      const id = ShortIdGenerate();
      this.put({
        TableName: 'idea_ISID',
        Item: { project, id },
        ConditionExpression: 'NOT (#p = :project AND #id = :id)',
        ExpressionAttributeNames: { '#p': 'project', '#id': 'id' },
        ExpressionAttributeValues: { ':project': project, ':id': id }
      })
        .then(() => resolve(id))
        .catch(() =>
          // ID exists, try again
          this.isidHelper(project, attempt + 1, maxAttempts, resolve, reject)
        );
    }
  }

  /**
   * Manage atomic counters (atomic autoincrement values) in IDEA's projects.
   * They key of an atomic counter should be composed as the following: `DynamoDBTableName_uniqueKey`.
   * @param key the key of the counter
   */
  public getAtomicCounterByKey(key: string): Promise<number> {
    return new Promise((resolve, reject) => {
      logger('GET ATOMIC COUNTER');
      this.update({
        TableName: 'idea_atomicCounters',
        Key: { key },
        UpdateExpression: 'ADD atomicCounter :increment',
        ExpressionAttributeValues: { ':increment': 1 },
        ReturnValues: 'UPDATED_NEW'
      })
        .then((data: any) => resolve(data.Attributes.atomicCounter))
        .catch(err => reject(err));
    });
  }

  /**
   * Get an item of a DynamoDB table.
   */
  public get(params: DDB.DocumentClient.GetItemInput): Promise<DDB.DocumentClient.AttributeMap | any> {
    return new Promise((resolve, reject) => {
      this.dynamo.get(params, (err: Error, data: DDB.DocumentClient.GetItemOutput) => {
        logger(`GET ${params.TableName}`, err);
        if (err || !data.Item) reject(err);
        else resolve(data.Item);
      });
    });
  }

  /**
   * Put an item in a DynamoDB table.
   */
  public put(params: DDB.DocumentClient.PutItemInput): Promise<DDB.DocumentClient.PutItemOutput> {
    return new Promise((resolve, reject) => {
      this.dynamo.put(params, (err: Error, data: DDB.DocumentClient.PutItemOutput) => {
        logger(`PUT ${params.TableName}`, err);
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * Update an item of a DynamoDB table.
   */
  public update(params: DDB.DocumentClient.UpdateItemInput): Promise<DDB.DocumentClient.UpdateItemOutput> {
    return new Promise((resolve, reject) => {
      this.dynamo.update(params, (err: Error, data: DDB.DocumentClient.UpdateItemOutput) => {
        logger(`UPDATE ${params.TableName}`, err);
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * Delete an item of a DynamoDB table.
   */
  public delete(params: DDB.DocumentClient.DeleteItemInput): Promise<DDB.DocumentClient.DeleteItemOutput> {
    return new Promise((resolve, reject) => {
      this.dynamo.delete(params, (err: Error, data: DDB.DocumentClient.DeleteItemOutput) => {
        logger(`DELETE ${params.TableName}`, err);
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * Get group of items based on their keys from DynamoDb table, avoiding the limits of DynamoDB's BatchGetItem.
   * @param ignoreErr if set, ignore the errors and continue the bulk op.
   */
  public batchGet(
    table: string,
    keys: DDB.DocumentClient.Key[],
    ignoreErr?: boolean
  ): Promise<(DDB.DocumentClient.AttributeMap | any)[]> {
    return new Promise((resolve, reject) => {
      if (!keys.length) {
        logger(`BATCH GET ${table}`, null, 'No elements to get');
        resolve([]);
      } else this.batchGetHelper(table, keys, [], Boolean(ignoreErr), 0, 100, resolve, reject);
    });
  }
  protected batchGetHelper(
    t: string,
    keys: DDB.DocumentClient.Key[],
    elements: DDB.DocumentClient.AttributeMap[],
    iErr: boolean,
    curr: number,
    size: number,
    resolve: any,
    reject: any
  ) {
    // prepare the structure for the bulk operation
    const batch: any = { RequestItems: {} };
    batch.RequestItems[t] = { Keys: [] };
    batch.RequestItems[t].Keys = keys.slice(curr, curr + size);
    // execute the bulk operation
    this.dynamo.batchGet(batch, (err: Error, data: DDB.DocumentClient.BatchGetItemOutput) => {
      logger(`BATCH GET ${t}`, err, `${curr} of ${keys.length}`);
      if (err && !iErr) return reject(err);
      // concat the results
      elements = elements.concat(data.Responses[t]);
      // if there are still chunks to manage, go on recursively
      if (curr + size < keys.length) this.batchGetHelper(t, keys, elements, iErr, curr + size, size, resolve, reject);
      // no more chunks to manage: we're done
      else resolve(elements);
    });
  }

  /**
   * Put an array of items in a DynamoDb table, avoiding the limits of DynamoDB's BatchWriteItem.
   * @param ignoreErr if true, ignore the errors and continue the bulk op
   */
  public batchPut(table: string, items: DDB.DocumentClient.AttributeMap[], ignoreErr?: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!items.length) {
        logger(`BATCH WRITE (PUT) ${table}`, null, 'No elements to write');
        resolve();
      } else this.batchWriteHelper(table, items, true, Boolean(ignoreErr), 0, 25, resolve, reject);
    });
  }
  /**
   * Delete an array of items from a DynamoDb table, avoiding the limits of DynamoDB's BatchWriteItem.
   * @param ignoreErr if true, ignore the errors and continue the bulk op.
   */
  public batchDelete(table: string, keys: DDB.DocumentClient.Key[], ignoreErr?: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      if (keys.length === 0) {
        logger(`BATCH WRITE (DELETE) ${table}`, null, 'No elements to write');
        resolve();
      } else this.batchWriteHelper(table, keys, false, Boolean(ignoreErr), 0, 25, resolve, reject);
    });
  }
  protected batchWriteHelper(
    t: string,
    items: DDB.DocumentClient.AttributeMap[],
    isPut: boolean,
    iErr: boolean,
    curr: number,
    size: number,
    resolve: any,
    reject: any
  ) {
    // prepare the structure for the bulk operation
    const batch: any = { RequestItems: {} };
    if (isPut) {
      batch.RequestItems[t] = items.slice(curr, curr + size).map(i => ({ PutRequest: { Item: i } }));
    } else {
      // isDelete
      batch.RequestItems[t] = items.slice(curr, curr + size).map(k => ({ DeleteRequest: { Key: k } }));
    }
    // execute the bulk operation
    this.dynamo.batchWrite(batch, (err: Error) => {
      logger(`BATCH WRITE (${isPut ? 'PUT' : 'DELETE'}) ${t}`, err, `${curr} of ${items.length}`);
      if (err && !iErr) reject(err);
      // if there are still chunks to manage, go on recursively
      else if (curr + size < items.length)
        this.batchWriteHelper(t, items, isPut, iErr, curr + size, size, resolve, reject);
      // no more chunks to manage: we're done
      else resolve();
    });
  }

  /**
   * Query a DynamoDb table, avoiding the limits of DynamoDB's Query.
   * @param params the params to apply to DynamoDB's function
   */
  public query(params: DDB.DocumentClient.QueryInput): Promise<(DDB.DocumentClient.AttributeMap | any)[]> {
    return new Promise((resolve, reject) => {
      this.queryScanHelper(params, [], true, resolve, reject);
    });
  }
  /**
   * Scan a DynamoDb table, avoiding the limits of DynamoDB's Query.
   * @param params the params to apply to DynamoDB's function
   */
  public scan(params: DDB.DocumentClient.ScanInput): Promise<(DDB.DocumentClient.AttributeMap | any)[]> {
    return new Promise((resolve, reject) => {
      this.queryScanHelper(params, [], false, resolve, reject);
    });
  }
  protected queryScanHelper(
    params: DDB.DocumentClient.QueryInput | DDB.DocumentClient.ScanInput,
    items: DDB.DocumentClient.AttributeMap[],
    isQuery: boolean,
    resolve: any,
    reject: any
  ) {
    const f = isQuery ? 'query' : 'scan';
    (this.dynamo as any)[f](
      params,
      (err: Error, data: DDB.DocumentClient.QueryOutput | DDB.DocumentClient.ScanOutput) => {
        if (err || !data || !data.Items) {
          logger(`${f.toUpperCase()} ${params.TableName}`, err);
          return reject(err);
        }
        items = items.concat(data.Items);
        if (data.LastEvaluatedKey) {
          params.ExclusiveStartKey = data.LastEvaluatedKey;
          this.queryScanHelper(params, items, isQuery, resolve, reject);
        } else {
          logger(`${f.toUpperCase()} ${params.TableName}`, null, items.length);
          resolve(items);
        }
      }
    );
  }

  /**
   * Query a DynamoDb table in the traditional way (no pagination or data mapping).
   * @param params the params to apply to DynamoDB's function
   */
  public queryClassic(params: DDB.DocumentClient.QueryInput): Promise<DDB.DocumentClient.QueryOutput[]> {
    return new Promise((resolve, reject) => {
      this.queryScanClassicHelper(params, true, resolve, reject);
    });
  }
  /**
   * Scan a DynamoDb table in the traditional way (no pagination or data mapping).
   * @param params the params to apply to DynamoDB's function
   */
  public scanClassic(params: DDB.DocumentClient.ScanInput): Promise<DDB.DocumentClient.ScanOutput[]> {
    return new Promise((resolve, reject) => {
      this.queryScanClassicHelper(params, false, resolve, reject);
    });
  }
  protected queryScanClassicHelper(
    params: DDB.DocumentClient.QueryInput | DDB.DocumentClient.ScanInput,
    isQuery: boolean,
    resolve: any,
    reject: any
  ) {
    const f = isQuery ? 'query' : 'scan';
    (this.dynamo as any)[f](
      params,
      (err: Error, data: DDB.DocumentClient.QueryOutput | DDB.DocumentClient.QueryOutput) => {
        logger(`${f.toUpperCase()} classic ${params.TableName}`, err, data && data.Items ? data.Items.length : 0);
        if (err || !data) reject(err);
        else resolve(data);
      }
    );
  }

  /**
   * Execute a series of max 10 write operations in a single transaction.
   * @param ops the operations to execute in the transaction
   */
  public transactWrites(ops: DDB.DocumentClient.TransactWriteItem[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!ops.length) {
        logger('TRANSACTION WRITES', null, 'No elements to write');
        resolve();
      } else
        this.dynamo.transactWrite({ TransactItems: ops.slice(0, 10) }, (err: Error) => {
          logger('TRANSACTION WRITES', err);
          if (err) reject(err);
          else resolve();
        });
    });
  }

  /**
   * Creates a set of elements (DynamoDB format) inferring the type of set from the type of the first element.
   */
  public createSet(
    array: number[] | string[],
    options?: DDB.DocumentClient.CreateSetOptions
  ): DDB.DocumentClient.DynamoDbSet {
    return this.dynamo.createSet(array, options);
  }
}
