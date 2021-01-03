/* eslint-disable no-invalid-this */
import { existsSync, readFileSync } from 'fs';
import { Lambda } from 'aws-sdk';
import { APIRequestLog, logger } from 'idea-toolbox';

import { DynamoDB } from './dynamoDB';
import { Cognito } from './cognito';
import { S3 } from './s3';
import { SES } from './ses';
import { SNS } from './sns';
import { Translate } from './translate';
import { Attachments } from './attachments';
import { HTML2PDF } from './html2pdf';

/**
 * An abstract class to inherit to manage API requests (AWS API Gateway) in an AWS Lambda function.
 */
export abstract class ResourceController {
  protected callback: any;

  protected event: any;
  protected stage: string;

  protected authorization: string;
  protected claims: any;
  protected principalId: string;

  protected httpMethod: string;
  protected body: any;
  protected queryParams: any;
  protected resource: string;
  protected path: string;
  protected resourceId: string;

  protected tables: any;

  protected logRequestsWithKey: string;

  protected _dynamoDB: DynamoDB;
  protected _cognito: Cognito;
  protected _s3: S3;
  protected _ses: SES;
  protected _sns: SNS;
  protected _translate: Translate;
  protected _attachments: Attachments;
  protected _html2pdf: HTML2PDF;

  protected currentLang: string;
  protected defaultLang: string;
  protected translations: any;
  protected templateMatcher = /{{\s?([^{}\s]*)\s?}}/g;

  /**
   * Initialize a new ResourceController helper object.
   * @param event the event that invoked the AWS lambda function
   * @param callback the callback to resolve or reject the execution
   */
  constructor(event: any, callback: any, options?: ResourceControllerOptions) {
    options = options || ({} as ResourceControllerOptions);

    this.event = event;
    this.stage = event.requestContext ? event.requestContext.stage : null;

    this.callback = callback;

    this.authorization = event.headers ? event.headers.Authorization : null;
    this.claims =
      event.requestContext && event.requestContext.authorizer ? event.requestContext.authorizer.claims : null;
    this.principalId = this.claims ? this.claims.sub : null;

    this.httpMethod = event.httpMethod || null;
    this.resource = (event.resource || '').replace('+', ''); // {proxy+} -> {proxy}
    this.path = event.path || '';
    this.resourceId =
      event.pathParameters && event.pathParameters[options.resourceId || 'proxy']
        ? decodeURIComponent(event.pathParameters[options.resourceId || 'proxy'])
        : '';
    this.queryParams = event.queryStringParameters || {};
    this.body = (event.body ? JSON.parse(event.body) : {}) || {};

    this.tables = options.tables || {};

    this.logRequestsWithKey = options.logRequestsWithKey;

    // set the logs to print objects deeper
    require('util').inspect.defaultOptions.depth = null;

    // print the initial log, making sure it
    const info = { principalId: this.principalId, queryParams: this.queryParams, body: this.body };
    logger(`START: ${this.httpMethod} ${this.stage} ${this.path}`, null, info, true);
  }

  ///
  /// REQUEST HANDLERS
  ///

  /**
   * The main function, that handle an API request redirected to a Lambda function.
   */
  public handleRequest = () => {
    // check the authorizations and prepare the API request
    this.checkAuthBeforeRequest()
      .then(() => {
        let request;
        if (this.resourceId)
          switch (this.httpMethod) {
            // resource/{resourceId}
            case 'GET':
              request = this.getResource();
              break;
            case 'POST':
              request = this.postResource();
              break;
            case 'PUT':
              request = this.putResource();
              break;
            case 'DELETE':
              request = this.deleteResource();
              break;
            case 'PATCH':
              request = this.patchResource();
              break;
            case 'HEAD':
              request = this.headResource();
              break;
            default: /* nope */
          }
        else
          switch (this.httpMethod) {
            // resource
            case 'GET':
              request = this.getResources();
              break;
            case 'POST':
              request = this.postResources();
              break;
            case 'PUT':
              request = this.putResources();
              break;
            case 'DELETE':
              request = this.deleteResources();
              break;
            case 'PATCH':
              request = this.patchResources();
              break;
            case 'HEAD':
              request = this.headResources();
              break;
            default: /* nope */
          }
        // execute the API request
        if (!request) this.done(new Error('UNSUPPORTED_METHOD'));
        else {
          request.then((res: any) => this.done(null, res)).catch((err: Error) => this.done(err));
        }
      })
      .catch(err => this.done(new Error(err && err.message ? err.message : 'FORBIDDEN')));
  };
  /**
   * To @override
   */
  protected checkAuthBeforeRequest(): Promise<void> {
    return new Promise(resolve => resolve());
  }
  /**
   * Default callback for IDEA's API resource controllers.
   * @param err if not null, it contains the error raised
   * @param res if err, the error string, otherwise the result (a JSON to parse)
   */
  protected done(err: Error, res?: any): any {
    logger(err ? 'DONE WITH ERRORS' : 'DONE', err, res, true);
    // if configured, store the log of the request
    if (this.logRequestsWithKey) this.storeLog(!err);
    // send the response
    this.callback(null, {
      statusCode: err ? '400' : '200',
      body: err ? JSON.stringify({ message: err.message }) : JSON.stringify(res || {}),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
  /**
   * To @override
   */
  protected getResource(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected postResource(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected putResource(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected deleteResource(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected headResource(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected getResources(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected postResources(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected putResources(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected patchResource(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected patchResources(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected deleteResources(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }
  /**
   * To @override
   */
  protected headResources(): Promise<any> {
    return new Promise((_, reject) => reject(new Error('UNSUPPORTED_METHOD')));
  }

  ///
  /// AWS SERVICES
  ///
  get dynamoDB(): DynamoDB {
    if (!this._dynamoDB) this._dynamoDB = new DynamoDB();
    return this._dynamoDB;
  }
  set dynamoDB(dynamoDB: DynamoDB) {
    this._dynamoDB = dynamoDB;
  }
  get cognito(): Cognito {
    if (!this._cognito) this._cognito = new Cognito();
    return this._cognito;
  }
  set cognito(cognito: Cognito) {
    this._cognito = cognito;
  }
  get s3(): S3 {
    if (!this._s3) this._s3 = new S3();
    return this._s3;
  }
  set s3(s3: S3) {
    this._s3 = s3;
  }
  get ses(): SES {
    if (!this._ses) this._ses = new SES();
    return this._ses;
  }
  set ses(ses: SES) {
    this._ses = ses;
  }
  get sns(): SNS {
    if (!this._sns) this._sns = new SNS();
    return this._sns;
  }
  set sns(sns: SNS) {
    this._sns = sns;
  }
  get translate(): Translate {
    if (!this._translate) this._translate = new Translate();
    return this._translate;
  }
  set translate(translate: Translate) {
    this._translate = translate;
  }

  ///
  /// HELPERS
  ///

  /**
   * Manage attachments (through SignedURLs).
   */
  get attachments(): Attachments {
    if (!this._attachments) this._attachments = new Attachments();
    return this._attachments;
  }
  set attachments(attachments: Attachments) {
    this._attachments = attachments;
  }
  /**
   * Manage PDF creation from HTML source.
   */
  get html2pdf(): HTML2PDF {
    if (!this._html2pdf) this._html2pdf = new HTML2PDF();
    return this._html2pdf;
  }
  set html2pdf(html2pdf: HTML2PDF) {
    this._html2pdf = html2pdf;
  }
  /**
   * Store the log associated to the request (no response/error handling).
   */
  protected storeLog(succeeded: boolean) {
    // create the log
    const log = new APIRequestLog({
      logId: this.logRequestsWithKey,
      userId: this.principalId,
      resource: this.resource,
      path: this.path,
      resourceId: this.resourceId,
      method: this.httpMethod,
      succeeded
    });
    // optionally add a track of the action
    if (this.httpMethod === 'PATCH' && this.body && this.body.action) log.action = this.body.action;
    // insert the log and don't wait for response or errors
    this.dynamoDB.put({ TableName: 'idea_logs', Item: log }).catch(() => {});
  }
  /**
   * Check whether shared resource exists in the back-end (translation, template, etc.).
   */
  protected sharedResourceExists(path: string): boolean {
    return existsSync(`./_shared/${path}`);
  }
  /**
   * Load a shared resource in the back-end (translation, template, etc.).
   * @param encoding default: `utf-8`
   */
  protected loadSharedResource(path: string, encoding?: string) {
    encoding = encoding || 'utf-8';
    return readFileSync(`./_shared/${path}`, { encoding });
  }

  ///
  /// MANAGE INTERNAL API REQUESTS (lambda invokes masked as API requests)
  ///

  /**
   * Simulate an internal API request, invoking directly the lambda and therefore saving resources.
   * @return the body of the response
   */
  public invokeInternalAPIRequest(params: InternalAPIRequestParams): Promise<any> {
    return new Promise((resolve, reject) => {
      // create a copy of the event
      const event = JSON.parse(JSON.stringify(this.event));
      // change only the event attributes we need; e.g. the authorization is unchanged
      event.httpMethod = params.httpMethod;
      event.resource = params.resource;
      event.pathParameters = params.pathParams || {};
      event.queryStringParameters = params.queryParams || {};
      event.body = JSON.stringify(params.body || {});
      // parse the path
      event.path = event.resource;
      for (const p in event.pathParameters)
        if (event.pathParameters[p]) event.resource = event.resource.replace(`{${p}}`, event.pathParameters[p]);
      // set a flag to make the invoked to recognise that is an internal request
      event.internalAPIRequest = true;
      // invoke the lambda with the event prepaired, simulating an API request
      new Lambda().invoke(
        { FunctionName: params.lambda, InvocationType: 'RequestResponse', Payload: JSON.stringify(event) },
        (err: Error, res: any) => {
          // reject in case of internal error
          if (err) reject(err);
          else {
            // parse the payload and the body
            const payload = JSON.parse(res.Payload);
            const body = JSON.parse(payload.body);
            // if the response is successfull, return the body
            if (Number(payload.statusCode) === 200) resolve(body);
            // otherwise, reject the controlled error
            else reject(new Error(body.message));
          }
        }
      );
    });
  }
  /**
   * Whether the current request comes from an internal API request, i.e. it was invoked by another controller.
   */
  public comesFromInternalRequest(): boolean {
    return Boolean(this.event.internalAPIRequest);
  }

  //
  // TRANSLATIONS
  //

  /**
   * Load the translations from the shared resources and set them with a fallback language.
   */
  protected loadTranslations(lang: string, defLang?: string) {
    // check for the existance of the mandatory source file
    if (!this.sharedResourceExists(`i18n/${lang}.json`)) return;
    // set the languages
    this.currentLang = lang;
    this.defaultLang = defLang || lang;
    this.translations = {};
    // load the translations in the chosen language
    this.translations[this.currentLang] = JSON.parse(
      this.loadSharedResource(`i18n/${this.currentLang}.json`).toString()
    );
    // load the translations in the default language, if set and differ from the current
    if (this.defaultLang !== this.currentLang && this.sharedResourceExists(`i18n/${this.defaultLang}.json`))
      this.translations[this.defaultLang] = JSON.parse(
        this.loadSharedResource(`i18n/${this.defaultLang}.json`).toString()
      );
  }
  /**
   * Get a translated term by key, optionally interpolating variables (e.g. `{{user}}`).
   * If the term doesn't exist in the current language, it is searched in the default language.
   */
  protected t(key: string, interpolateParams?: any): string {
    if (!this.translations || !this.currentLang) return;
    if (!this.isDefined(key) || !key.length) return;
    let res = this.interpolate(this.getValue(this.translations[this.currentLang], key), interpolateParams);
    if (res === undefined && this.defaultLang !== null && this.defaultLang !== this.currentLang)
      res = this.interpolate(this.getValue(this.translations[this.defaultLang], key), interpolateParams);
    return res;
  }
  /**
   * Interpolates a string to replace parameters.
   * "This is a {{ key }}" ==> "This is a value", with params = { key: "value" }
   */
  private interpolate(expr: string, params?: any): string {
    if (!params || !expr) return expr;
    return expr.replace(this.templateMatcher, (substring: string, b: string) => {
      const r = this.getValue(params, b);
      return this.isDefined(r) ? r : substring;
    });
  }
  /**
   * Gets a value from an object by composed key.
   * getValue({ key1: { keyA: 'valueI' }}, 'key1.keyA') ==> 'valueI'
   */
  private getValue(target: any, key: string): any {
    const keys = typeof key === 'string' ? key.split('.') : [key];
    key = '';
    do {
      key += keys.shift();
      if (this.isDefined(target) && this.isDefined(target[key]) && (typeof target[key] === 'object' || !keys.length)) {
        target = target[key];
        key = '';
      } else if (!keys.length) target = undefined;
      else key += '.';
    } while (keys.length);
    return target;
  }
  /**
   * Helper to quicly check if the value is defined.
   */
  private isDefined(value: any): boolean {
    return value !== undefined && value !== null;
  }
}

/**
 * The initial options for a constructor of class ResourceController.
 */
export interface ResourceControllerOptions {
  /**
   * The tables involved an their names in DynamoDB; e.g. { users: 'project_users' }.
   */
  tables?: any;
  /**
   * The resourceId of the API request, to specify if different from "proxy".
   */
  resourceId?: string;
  /**
   * If set, the logs of the API requests on this resource will be stored (using this key).
   */
  logRequestsWithKey?: string;
}

/**
 * The parameters needed to invoke an internal API request.
 */
export interface InternalAPIRequestParams {
  /**
   * The name of the lambda function receiving the request; e.g. `project_memberships`.
   */
  lambda: string;
  /**
   * The http method to use.
   */
  httpMethod: string;
  /**
   * The path (in the internal API) to the resource we need; e.g. `teams/{teamId}/memberships/{userId}`.
   */
  resource: string;
  /**
   * The parameters to substitute in the path.
   */
  pathParams?: { [index: string]: string | number };
  /**
   * The parameters to substitute in the path.
   */
  queryParams?: { [index: string]: string | number };
  /**
   * The body of the request.
   */
  body?: any;
}
