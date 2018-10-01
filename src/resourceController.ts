import UUIDV4 = require('uuid/v4');
import IdeaX = require('idea-toolbox');

import { DynamoDB } from './dynamoDB';
import { Cognito } from './cognito';
import { S3 } from './s3';
import { SES } from './ses';
import { SNS } from './sns';
import { RequestLog } from './requestLog';

/**
 * An abstract class to inherit to manage API requests (AWS API Gateway) in an
 * AWS Lambda function.
 */
export abstract class ResourceController {
  protected callback: any;

  protected authorization: string;
  protected claims: any;
  protected principalId: string;

  protected httpMethod: string;
  protected body: any;
  protected queryParams: any;
  protected resource: string;
  protected resourceId: string;

  protected tables: any;

  protected _dynamoDB: DynamoDB;
  protected _cognito: Cognito;
  protected _s3: S3;
  protected _ses: SES;
  protected _sns: SNS;

  /**
   * Initialize a new ResourceController helper object.
   * @param {any} event the event that invoked the AWS lambda function
   * @param {any} callback the callback to resolve or reject the execution
   * @param {ResourceControllerOptions} options
   */
  constructor(event: any, callback: any, options?: ResourceControllerOptions) {
    options = options || <ResourceControllerOptions> {};
    IdeaX.logger('START', null, event, true);

    this.callback = callback;

    this.authorization = event.headers.Authorization;
    this.claims = event.requestContext.authorizer ? event.requestContext.authorizer.claims : null;
    this.principalId = this.claims ? this.claims.sub : null;

    this.httpMethod = event.httpMethod;
    this.resource = event.resource;
    this.resourceId = event.pathParameters && event.pathParameters[options.resourceId || 'proxy']
      ? decodeURIComponent(event.pathParameters[options.resourceId || 'proxy']) : '';
    this.queryParams = event.queryStringParameters || {};
    this.body = JSON.parse(event.body) || {};

    this.tables = options.tables || {};
  }

///
/// REQUEST HANDLERS
///

  /**
   * The main function, that handle an API request redirected to a Lambda function.
   */
  public handleRequest = (): void => {
    // check the authorizations and prepare the API request
    this.checkAuthBeforeRequest()
    .then(() => {
      let request;
      if(this.resourceId) switch(this.httpMethod) {
        // resource/{resourceId}
        case 'GET': request = this.getResource(); break;
        case 'POST': request = this.postResource(); break;
        case 'PUT': request = this.putResource(); break;
        case 'DELETE': request = this.deleteResource(); break;
        case 'PATCH': request = this.patchResource(); break;
        case 'HEAD': request = this.headResource(); break;
        default: /* nope */;
      } else switch(this.httpMethod) {
        // resource
        case 'GET': request = this.getResources(); break;
        case 'POST': request = this.postResources(); break;
        case 'PUT': request = this.putResources(); break;
        case 'DELETE': request = this.deleteResources(); break;
        case 'PATCH': request = this.patchResources(); break;
        case 'HEAD': request = this.headResources(); break;
        default: /* nope */;
      }
      // execute the API request
      if(!request) this.done(new Error(`E.COMMON.UNSUPPORTED_ACTION`));
      else {
        IdeaX.logger('REQUEST', null, this.httpMethod, true);
        request
        .then((res: any) => this.done(null, res))
        .catch((err: Error) => this.done(err));
      }
    })
    .catch(() => this.done(new Error(`E.COMMON.UNAUTHORIZED`)));
  }
  /**
   * To @override
   */
  protected checkAuthBeforeRequest(): Promise<void> {
    return new Promise(resolve => resolve());
  };
  /**
   * Default callback for IDEA's API resource controllers.
   * @param {Error} err if not null, it contains the error raised
   * @param {any} res if err, the error string, otherwise the result (a JSON to parse)
   */
  protected done(err: Error, res?: any): any {
    IdeaX.logger(`DONE`, err, res, true);
    // if the table `requestsLogs` has been specified, a log of the request will be stored in it
    this.storeLog(!err);
    // send the response
    this.callback(null, {
      statusCode: err ? '400' : '200',
      body: err ?  JSON.stringify({ message: err.message }) : JSON.stringify(res || {}),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
  /**
   * To @override
   */
  protected getResource(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected postResource(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected putResource(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected deleteResource(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected headResource(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected getResources(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected postResources(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected putResources(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected patchResource(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected patchResources(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected deleteResources(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };
  /**
   * To @override
   */
  protected headResources(): Promise<any> {
    return new Promise((resolve, reject) => reject(new Error(`E.COMMON.UNSUPPORTED_ACTION`)));
  };

///
/// AWS SERVICES
///
  get dynamoDB(): DynamoDB {
    if(!this._dynamoDB) this._dynamoDB = new DynamoDB();
    return this._dynamoDB;
  }
  set dynamoDB(dynamoDB: DynamoDB) {
    this._dynamoDB = dynamoDB;
  }
  get cognito(): Cognito {
    if(!this._cognito) this._cognito = new Cognito();
    return this._cognito;
  }
  set cognito(cognito: Cognito) {
    this._cognito = cognito;
  }
  get s3(): S3 {
    if(!this._s3) this._s3 = new S3();
    return this._s3;
  }
  set s3(s3: S3) {
    this._s3 = s3;
  }
  get ses(): SES {
    if(!this._ses) this._ses = new SES();
    return this._ses;
  }
  set ses(ses: SES) {
    this._ses = ses;
  }
  get sns(): SNS {
    if(!this._sns) this._sns = new SNS();
    return this._sns;
  }
  set sns(sns: SNS) {
    this._sns = sns;
  }

///
/// HELPERS
///

  /**
   * Store the log associated to the request (no response/error handling).
   */
  protected storeLog(success: boolean): void {
    if(!this.tables.requestsLogs) return;
    // set the TTL of the log (1 month)
    let expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth()+1);
    // insert the log and don't wait for response or errors
    this.dynamoDB.put({ TableName: this.tables.requestsLogs, Item: <RequestLog> {
      key: this.resource,
      at: String(new Date().getTime()).concat('_'.concat(UUIDV4())),
      expiresAt: Math.round(expiresAt.getTime()/1000),
      userId: this.principalId,
      resource: this.resource,
      resourceId: this.resourceId,
      method: this.httpMethod,
      action: this.body && this.body.action ? this.body.action : null,
      requestSucceeded: success
    }})
    .then(() => {})
    .catch(() => {});
  }
}

/**
 * The initial options for a constructor of class ResourceController.
 */
export interface ResourceControllerOptions {
  /**
   * The tables involved an their names in DynamoDB; e.g. { users: 'project_users' }.
   *
   * If the special table `requestsLogs` is specified, a log of the request will be stored in it.
   */
  tables?: any;
  /**
   * The resourceId of the API request, to specify if different from "proxy".
   */
  resourceId?: string;
}