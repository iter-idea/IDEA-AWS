import AWS = require('aws-sdk');
import UUIDV4 = require('uuid/v4');
import IdeaX = require('idea-toolbox');

/**
 * A wrapper for AWS DynamoDB.
 */
export class DynamoDB {
  protected dynamo: AWS.DynamoDB.DocumentClient; // the instance of DynamoDB

  /**
   * Initialize a new DynamoDB helper object.
   */
  constructor() {
    this.dynamo = new AWS.DynamoDB.DocumentClient();
  }

  /**
   * Returns an IUID: IDEA's Unique IDentifier, which is an id unique through all IDEA's projects.
   * Note: there's no need of an authorization check for extrernal uses: the permissions depend
   * from the context in which it's executed.
   * @param {string} project project code
   * @return {Promise<string>} the IUID
   */
  public IUID(project: string): Promise<string> {
    const MAX_ATTEMPTS = 3;
    return new Promise((resolve, reject) => {
      if (!project) reject();
      else this.iuidHelper(project, 0, MAX_ATTEMPTS, resolve, reject);
    });
  }
  /**
   * @private helper
   */
  protected iuidHelper(
    project: string, attempt: number, maxAttempts: number, resolve: any, reject: any
  ): void {
    if (attempt > maxAttempts) reject();
    else {
      const id = UUIDV4();
      this.put({
        TableName: 'idea_IUID',
        Item: { project: project, id: id },
        ConditionExpression: 'NOT (#p = :project AND #id = :id)',
        ExpressionAttributeNames: { '#p': 'project', '#id': 'id' },
        ExpressionAttributeValues: { ':project': project, ':id': id }
      })
      .then(() => resolve(`${project}_${id}`))
      .catch(() => // ID exists, try again
        this.iuidHelper(project, attempt + 1, maxAttempts, resolve, reject));
    }
  }

  /**
   * Manage atomic counters (atomic autoincrement values) in IDEA's projects.
   * They key of an atomic counter should be composed as the following: `DynamoDBTableName_uniqueKey`.
   * @param {string} key the key of the counter
   * @return {Promise<number>}
   */
  public getAtomicCounterByKey(key: string): Promise<number> {
    return new Promise((resolve, reject) => {
      IdeaX.logger('GET ATOMIC COUNTER', null, key);
      this.update({
        TableName: 'idea_atomicCounters', Key: { key: key },
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
   * @param {any} params the params to apply to DynamoDB's function
   * @return {Promise<any>}
   */
  public get(params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.dynamo.get(params, (err: Error, data: any) => {
        IdeaX.logger(`GET ${params.IndexName
          ? `${params.TableName} (${params.IndexName})`
          : params.TableName}`, err, data);
        if (err || !data.Item) reject(err);
        else resolve(data.Item);
      });
    });
  }

  /**
   * Put an item in a DynamoDB table.
   * @param {any} params the params to apply to DynamoDB's function
   * @return {Promise<any>}
   */
  public put(params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.dynamo.put(params, (err: Error, data: any) => {
        IdeaX.logger(`PUT ${params.TableName}`, err, params.Item);
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * Update an item of a DynamoDB table.
   * @param {any} params the params to apply to DynamoDB's function
   * @return {Promise<any>}
   */
  public update(params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.dynamo.update(params, (err: Error, data: any) => {
        IdeaX.logger(`UPDATE ${params.TableName}`, err, data);
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * Delete an item of a DynamoDB table.
   * @param {any} params The params to apply to DynamoDB's function
   * @return {Promise<any>}
   */
  public delete(params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.dynamo.delete(params, (err: Error, data: any) => {
        IdeaX.logger(`DELETE ${params.TableName}`, err, params.Key);
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * Get group of items based on their keys from DynamoDb table,
   * avoiding the limits of DynamoDB's BatchGetItem.
   * @param {string} table DynamoDB table on which to operate
   * @param {Array<any>} keys the keys of items to get
   * @param {boolean} ignoreErr if true, ignore the errors and continue the bulk op.
   * @return {Promise<Array<any>>}
   */
  public batchGet(table: string, keys: Array<any>, ignoreErr?: boolean): Promise<Array<any>> {
    return new Promise((resolve, reject) => {
      if (keys.length === 0) {
        IdeaX.logger(`BATCH GET ${table}`, null, `No elements to get`);
        resolve();
      } else this.batchGetHelper(table, keys, [], Boolean(ignoreErr), 0, 100, resolve, reject);
    });
  }
  /**
   * @private helper
   */
  protected batchGetHelper(
    t: string, keys: Array<any>, elements: Array<any>, iErr: boolean, curr: number, size: number,
    resolve: any, reject: any
  ): void {
    // prepare the structure for the bulk operation
    const batch: any = { RequestItems: {} };
    batch.RequestItems[t] = { Keys: [] };
    batch.RequestItems[t].Keys = keys.slice(curr, curr + size);
    // execute the bulk operation
    this.dynamo.batchGet(batch, (err: Error, data: any) => {
      IdeaX.logger(`BATCH GET ${t}`, err, `${curr} of ${keys.length}`);
      if (err && !iErr) return reject(err);
      // concat the results
      elements = elements.concat(data.Responses[t]);
      // if there are still chunks to manage, go on recursively
      if (curr + size < keys.length)
        this.batchGetHelper(t, keys, elements, iErr, curr + size, size, resolve, reject);
      // no more chunks to manage: we're done
      else resolve(elements);
    });
  }

  /**
   * Put an array of items in a DynamoDb table, avoiding the limits of DynamoDB's BatchWriteItem.
   * @param {string} table DynamoDB table on which to operate
   * @param {Array<any>} items the items to put
   * @param {boolean} ignoreErr if true, ignore the errors and continue the bulk op.
   * @return {Promise<any>}
   */
  public batchPut(table: string, items: Array<any>, ignoreErr?: boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      if (items.length === 0) {
        IdeaX.logger(`BATCH WRITE (PUT) ${table}`, null, `No elements to write`);
        resolve();
      } else this.batchWriteHelper(table, items, true, Boolean(ignoreErr), 0, 25, resolve, reject);
    });
  }
  /**
   * Delete an array of items from a DynamoDb table,
   * avoiding the limits of DynamoDB's BatchWriteItem.
   * @param {string} table DynamoDB table on which to operate
   * @param {Array<any>} keys the keys of items to delete
   * @param {boolean} ignoreErr if true, ignore the errors and continue the bulk op.
   * @return {Promise<any>}
   */
  public batchDelete(table: string, keys: Array<any>, ignoreErr?: boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      if (keys.length === 0) {
        IdeaX.logger(`BATCH WRITE (DELETE) ${table}`, null, `No elements to write`);
        resolve();
      } else this.batchWriteHelper(table, keys, false, Boolean(ignoreErr), 0, 25, resolve, reject);
    });
  }
  /**
   * @private helper
   */
  protected batchWriteHelper(
    t: string, items: Array<any>, isPut: boolean, iErr: boolean,
    curr: number, size: number, resolve: any, reject: any
  ): void {
    // prepare the structure for the bulk operation
    const batch: any = { RequestItems: {} };
    if (isPut) {
      batch.RequestItems[t] = items
      .slice(curr, curr + size)
      .map(i => {
        return { PutRequest: { Item: i } };
      });
    } else { // isDelete
      batch.RequestItems[t] = items
      .slice(curr, curr + size)
      .map(k => {
        return { DeleteRequest: { Key: k } };
      });
    }
    // execute the bulk operation
    this.dynamo.batchWrite(batch, (err: Error) => {
      IdeaX.logger(`BATCH WRITE (${isPut ? 'PUT' : 'DELETE'}) ${t}`, err,
        `${curr} of ${items.length}`);
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
   * @param {any} params the params to apply to DynamoDB's function
   * @return {Promise<Array<any>>}
   */
  public query(params: any): Promise<Array<any>> {
    return new Promise((resolve, reject) => {
      this.queryScanHelper(params, [], true, resolve, reject);
    });
  }
  /**
   * Scan a DynamoDb table, avoiding the limits of DynamoDB's Query.
   * @param {any} params the params to apply to DynamoDB's function
   * @return {Promise<Array<any>>}
   */
  public scan(params: any): Promise<Array<any>> {
    return new Promise((resolve, reject) => {
      this.queryScanHelper(params, [], false, resolve, reject);
    });
  }
  /**
   * @private helper
   */
  protected queryScanHelper(
    params: any, items: Array<any>, isQuery: boolean, resolve: any, reject: any
  ): void {
    const f = isQuery ? 'query' : 'scan';
    (<any>this.dynamo)[f](params, (err: Error, data: any) => {
      if (err || !data || !data.Items) {
        IdeaX.logger(`${f.toUpperCase()} ${params.TableName}`, err, data);
        return reject(err);
      }
      items = items.concat(data.Items);
      if (data.LastEvaluatedKey) {
        params.ExclusiveStartKey = data.LastEvaluatedKey;
        this.queryScanHelper(params, items, isQuery, resolve, reject);
      } else {
        IdeaX.logger(`${f.toUpperCase()} ${params.TableName}`, null, items.length.toString());
        resolve(items);
      }
    });
  }

  /**
   * Execute a series of max 10 write operations in a single transaction.
   * @param {Array<AWS.DynamoDB.TransactWriteItem>} ops the operations to execute in the transaction
   * @return {Promise<any>}
   */
  public transactWrites(ops: Array<AWS.DynamoDB.DocumentClient.TransactWriteItem>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (ops.length === 0) {
        IdeaX.logger(`TRANSACTION WRITES`, null, `No elements to write`);
        resolve();
      } else this.dynamo.transactWrite({ TransactItems: ops.slice(0, 10) }, (err: Error) => {
        IdeaX.logger(`TRANSACTION WRITES`, err, null);
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
