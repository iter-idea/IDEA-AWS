/* eslint-disable no-invalid-this */
import { existsSync, readFileSync } from 'fs';
import { Lambda } from 'aws-sdk';
import { APIRequestLog, logger } from 'idea-toolbox';

import { GenericController, GenericControllerOptions } from './genericController';

/**
 * An abstract class to inherit to manage API requests (AWS API Gateway) in an AWS Lambda function.
 */
export abstract class ResourceController extends GenericController {
  protected authorization: string;
  protected claims: any;
  protected principalId: string;

  protected stage: string;
  protected httpMethod: string;
  body: any;
  queryParams: any;
  protected resource: string;
  protected path: string;
  protected resourceId: string;

  protected logRequestsWithKey: string;

  protected currentLang: string;
  protected defaultLang: string;
  protected translations: any;
  protected templateMatcher = /{{\s?([^{}\s]*)\s?}}/g;

  constructor(event: any, callback: any, options?: ResourceControllerOptions) {
    super(event, callback, options);

    this.authorization = event.headers?.Authorization;
    this.claims = event.requestContext?.authorizer?.claims;
    this.principalId = this.claims?.sub;

    this.stage = event.requestContext?.stage;
    this.httpMethod = event.httpMethod;
    this.resource = (event.resource || '').replace('+', ''); // {proxy+} -> {proxy}
    this.path = event.path || '';
    this.resourceId =
      event.pathParameters && event.pathParameters[options.resourceId || 'proxy']
        ? decodeURIComponent(event.pathParameters[options.resourceId || 'proxy'])
        : '';
    this.queryParams = event.queryStringParameters || {};
    this.body = (event.body ? JSON.parse(event.body) : {}) || {};

    this.logRequestsWithKey = options.logRequestsWithKey;

    // acquire some info about the client, if available
    let version = '?',
      platform = '?';
    if (this.queryParams['_v']) {
      version = this.queryParams['_v'];
      delete this.queryParams['_v'];
    }
    if (this.queryParams['_p']) {
      platform = this.queryParams['_p'];
      delete this.queryParams['_p'];
    }

    // print the initial log
    const info = { principalId: this.principalId, queryParams: this.queryParams, body: this.body, version, platform };
    logger(`START: ${this.httpMethod} ${this.stage} ${this.path}`, null, info, true);
  }

  ///
  /// REQUEST HANDLERS
  ///

  handleRequest = () => {
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
  protected done(err: Error | null, res?: any) {
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
  protected checkAuthBeforeRequest(): Promise<void> {
    return new Promise(resolve => resolve());
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
  /// HELPERS
  ///

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
    this.dynamoDB.put({ TableName: 'idea_logs', Item: log }).catch(() => {
      /* ignore */
    });
  }
  /**
   * Check whether shared resource exists in the back-end (translation, template, etc.).
   */
  sharedResourceExists(path: string): boolean {
    return existsSync(`assets/${path}`);
  }
  /**
   * Load a shared resource in the back-end (translation, template, etc.).
   */
  loadSharedResource(path: string) {
    return readFileSync(`assets/${path}`, { encoding: 'utf-8' });
  }

  ///
  /// MANAGE INTERNAL API REQUESTS (lambda invokes masked as API requests)
  ///

  /**
   * Simulate an internal API request, invoking directly the lambda and therefore saving resources.
   * @return the body of the response
   */
  invokeInternalAPIRequest(params: InternalAPIRequestParams): Promise<any> {
    return new Promise((resolve, reject) => {
      // create a copy of the event
      const event = JSON.parse(JSON.stringify(this.event));
      // change only the event attributes we need; e.g. the authorization is unchanged
      event.stage = params.stage || this.stage;
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
        {
          FunctionName: params.lambda,
          Qualifier: event.stage,
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify(event)
        },
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
  comesFromInternalRequest(): boolean {
    return Boolean(this.event.internalAPIRequest);
  }

  //
  // TRANSLATIONS
  //

  /**
   * Load the translations from the shared resources and set them with a fallback language.
   */
  loadTranslations(lang: string, defLang?: string) {
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
  t(key: string, interpolateParams?: any): string {
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
export interface ResourceControllerOptions extends GenericControllerOptions {
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
   * The alias of the lambda function to invoke. Default: the value of the current API stage.
   */
  stage?: string;
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
