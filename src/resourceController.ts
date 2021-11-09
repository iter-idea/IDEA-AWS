/* eslint-disable no-invalid-this */
import { existsSync, readFileSync } from 'fs';
import { Lambda } from 'aws-sdk';
import { APIRequestLog, CognitoUser, logger } from 'idea-toolbox';

import { GenericController, GenericControllerOptions } from './genericController';

/**
 * An abstract class to inherit to manage API requests (AWS API Gateway) in an AWS Lambda function.
 */
export abstract class ResourceController extends GenericController {
  protected authorization: string;
  protected claims: any;
  protected principalId: string;
  protected user: CognitoUser;

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

  constructor(event: any, callback: any, options: ResourceControllerOptions = {}) {
    super(event, callback, options);

    this.authorization = event.headers?.Authorization;
    this.claims = event.requestContext?.authorizer?.claims;
    this.principalId = this.claims?.sub;
    this.user = this.principalId ? new CognitoUser(this.claims) : null;

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

  handleRequest = async () => {
    try {
      await this.checkAuthBeforeRequest();

      try {
        let response;
        if (this.resourceId) {
          switch (this.httpMethod) {
            // resource/{resourceId}
            case 'GET':
              response = await this.getResource();
              break;
            case 'POST':
              response = await this.postResource();
              break;
            case 'PUT':
              response = await this.putResource();
              break;
            case 'DELETE':
              response = await this.deleteResource();
              break;
            case 'PATCH':
              response = await this.patchResource();
              break;
            case 'HEAD':
              response = await this.headResource();
              break;
            default:
              this.done(new Error('Unsupported method'));
          }
        } else {
          switch (this.httpMethod) {
            // resource
            case 'GET':
              response = await this.getResources();
              break;
            case 'POST':
              response = await this.postResources();
              break;
            case 'PUT':
              response = await this.putResources();
              break;
            case 'DELETE':
              response = await this.deleteResources();
              break;
            case 'PATCH':
              response = await this.patchResources();
              break;
            case 'HEAD':
              response = await this.headResources();
              break;
            default:
              this.done(new Error('Unsupported method'));
          }
        }

        this.done(null, response);
      } catch (err) {
        const errorMessage = (err as Error)?.message || (err as any)?.errorMessage || 'Operation failed';
        this.done(new Error(errorMessage));
      }
    } catch (err) {
      const errorMessage = (err as Error)?.message || (err as any)?.errorMessage || 'Forbidden';
      this.done(new Error(errorMessage));
    }
  };
  protected done(err: Error | null, res?: any, statusCode?: number) {
    logger(err ? 'DONE WITH ERRORS' : 'DONE', err, res, true);

    // if configured, store the log of the request
    if (this.logRequestsWithKey) this.storeLog(!err);

    this.callback(null, {
      statusCode: statusCode ?? (err ? '400' : '200'),
      body: err ? JSON.stringify({ message: err.message }) : JSON.stringify(res || {}),
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  /**
   * To @override
   */
  protected async checkAuthBeforeRequest(): Promise<void> {
    return;
  }
  /**
   * To @override
   */
  protected async getResource(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async postResource(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async putResource(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async deleteResource(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async headResource(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async getResources(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async postResources(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async putResources(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async patchResource(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async patchResources(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async deleteResources(): Promise<any> {
    throw new Error('Unsupported method');
  }
  /**
   * To @override
   */
  protected async headResources(): Promise<any> {
    throw new Error('Unsupported method');
  }

  ///
  /// HELPERS
  ///

  /**
   * Store the log associated to the request (no response/error handling).
   */
  protected storeLog(succeeded: boolean) {
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

    this.dynamoDB.put({ TableName: 'idea_logs', Item: log }).catch(() => {
      /* ignore */
    });
  }
  /**
   * Check whether shared resource exists in the back-end (translation, template, etc.).
   * Search for the specified file path in both the Lambda function's main folder and the layers folder.
   */
  sharedResourceExists(filePath: string): boolean {
    return existsSync(`assets/${filePath}`) || existsSync(`/opts/nodejs/assets/${filePath}`);
  }
  /**
   * Load a shared resource in the back-end (translation, template, etc.).
   * Search for the specified file path in both the Lambda function's main folder and the layers folder.
   */
  loadSharedResource(filePath: string): string {
    let path: string = null;

    if (existsSync(`assets/${filePath}`)) path = `assets/${filePath}`;
    else if (existsSync(`/opts/nodejs/assets/${filePath}`)) path = `/opts/nodejs/assets/${filePath}`;

    return path ? readFileSync(path, { encoding: 'utf-8' }) : null;
  }

  ///
  /// MANAGE INTERNAL API REQUESTS (lambda invokes masked as API requests)
  ///

  /**
   * Simulate an internal API request, invoking directly the lambda and therefore saving resources.
   * @return the body of the response
   * @deprecated don't run a Lambda from another Lambda (bad practice)
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
   * @deprecated don't run a Lambda from another Lambda (bad practice)
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
 * @deprecated don't run a Lambda from another Lambda (bad practice)
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
