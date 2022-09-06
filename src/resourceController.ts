import 'source-map-support/register';
import { existsSync, readFileSync } from 'fs';
import { Lambda, EventBridge } from 'aws-sdk';
import { APIGatewayProxyEventV2, APIGatewayProxyEvent, Callback } from 'aws-lambda';
import { APIRequestLog, CognitoUser } from 'idea-toolbox';

import { Logger } from './logger';
import { GenericController, GenericControllerOptions } from './genericController';

/**
 * An abstract class to inherit to manage API requests (AWS API Gateway) in an AWS Lambda function.
 */
export abstract class ResourceController extends GenericController {
  protected event: APIGatewayProxyEventV2 | APIGatewayProxyEvent;
  protected callback: Callback;

  protected initError = false;

  protected authorization: string;
  protected claims: any;
  protected principalId: string;
  protected cognitoUser: CognitoUser;

  protected stage: string;
  protected httpMethod: string;
  protected body: any;
  protected queryParams: any;
  protected resource: string;
  protected path: string;
  protected pathParameters: any;
  protected resourceId: string;

  protected returnStatusCode?: number;

  protected logger = new Logger();

  protected logRequestsWithKey: string;

  protected currentLang: string;
  protected defaultLang: string;
  protected translations: any;
  protected templateMatcher = /{{\s?([^{}\s]*)\s?}}/g;

  constructor(
    event: APIGatewayProxyEventV2 | APIGatewayProxyEvent,
    callback: Callback,
    options: ResourceControllerOptions = {}
  ) {
    super(event, callback, options);

    this.event = event;
    this.callback = callback;

    try {
      if ((event as APIGatewayProxyEventV2).version === '2.0')
        this.initFromEventV2(event as APIGatewayProxyEventV2, options);
      else this.initFromEventV1(event as APIGatewayProxyEvent, options);

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
      this.logger.info(`START: ${this.httpMethod} ${this.path}`, info);
    } catch (err) {
      this.initError = true;
      this.done(this.controlHandlerError(err, 'INIT-ERROR', 'Malformed request'));
    }
  }
  private initFromEventV2(event: APIGatewayProxyEventV2, options: ResourceControllerOptions): void {
    this.authorization = event.headers.authorization;
    const authorizer = (event.requestContext as any)?.authorizer ?? {};
    const contextFromAuthorizer = authorizer.lambda ?? authorizer.jwt?.claims ?? {};
    this.principalId = contextFromAuthorizer.principalId ?? contextFromAuthorizer.sub ?? null;
    this.cognitoUser = authorizer.jwt?.claims ? new CognitoUser(authorizer.jwt?.claims) : null;

    this.stage = event.requestContext.stage;
    this.httpMethod = event.requestContext.http.method;
    this.resource = event.routeKey.replace('+', ''); // {proxy+} -> {proxy}
    this.path = event.rawPath;
    this.pathParameters = {};
    for (const param in event.pathParameters)
      this.pathParameters[param] = event.pathParameters[param] ? decodeURIComponent(event.pathParameters[param]) : null;
    this.resourceId = this.pathParameters[options.resourceId || 'proxy'];
    this.queryParams = event.queryStringParameters || {};
    try {
      this.body = (event.body ? JSON.parse(event.body) : {}) || {};
    } catch (error) {
      throw new RCError('Malformed body');
    }
  }
  private initFromEventV1(event: APIGatewayProxyEvent, options: ResourceControllerOptions): void {
    this.authorization = event.headers.Authorization;
    this.claims = event.requestContext.authorizer?.claims || {};
    this.principalId = this.claims.sub;
    this.cognitoUser = this.principalId ? new CognitoUser(this.claims) : null;

    this.stage = event.requestContext.stage;
    this.httpMethod = event.httpMethod;
    this.resource = event.resource.replace('+', ''); // {proxy+} -> {proxy}
    this.path = event.path;
    this.pathParameters = {};
    for (const param in event.pathParameters)
      this.pathParameters[param] = event.pathParameters[param] ? decodeURIComponent(event.pathParameters[param]) : null;
    this.resourceId = this.pathParameters[options.resourceId || 'proxy'];
    this.queryParams = event.queryStringParameters || {};
    try {
      this.body = (event.body ? JSON.parse(event.body) : {}) || {};
    } catch (error) {
      throw new RCError('Malformed body');
    }
  }

  /**
   * Force the parsing of a query parameter as an array of strings.
   */
  protected getQueryParamAsArray(paramName: string): string[] {
    if (!this.queryParams[paramName]) return [];
    else if (Array.isArray(this.queryParams[paramName])) return this.queryParams[paramName];
    else return String(this.queryParams[paramName]).split(',');
  }

  ///
  /// REQUEST HANDLERS
  ///

  handleRequest = async (): Promise<void> => {
    if (this.initError) return;
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
              this.done(new RCError('Unsupported method'));
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
              this.done(new RCError('Unsupported method'));
          }
        }

        this.done(null, response);
      } catch (err) {
        this.done(this.controlHandlerError(err, 'HANDLER-ERROR', 'Operation failed'));
      }
    } catch (err) {
      this.done(this.controlHandlerError(err, 'AUTH-CHECK-ERROR', 'Forbidden'));
    }
  };
  private controlHandlerError(err: any = {}, context: string, replaceWithErrorMessage: string): Error {
    if (err instanceof RCError) return new Error(err.message);

    this.logger.error(context, err);
    return new Error(replaceWithErrorMessage);
  }
  protected done(err: any, res?: any, statusCode = this.returnStatusCode || (err ? 400 : 200)) {
    if (err) this.logger.info('END-FAILED', { statusCode, error: err.message || err.errorMessage });
    else this.logger.info('END-SUCCESS', { statusCode });

    // if configured, store the log of the request
    if (this.logRequestsWithKey) this.storeLog(!err);

    this.callback(null, {
      statusCode: String(statusCode),
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
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async postResource(): Promise<any> {
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async putResource(): Promise<any> {
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async deleteResource(): Promise<any> {
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async headResource(): Promise<any> {
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async getResources(): Promise<any> {
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async postResources(): Promise<any> {
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async putResources(): Promise<any> {
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async patchResource(): Promise<any> {
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async patchResources(): Promise<any> {
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async deleteResources(): Promise<any> {
    throw new RCError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async headResources(): Promise<any> {
    throw new RCError('Unsupported method');
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
    return existsSync(`assets/${filePath}`) || existsSync(`/opt/nodejs/assets/${filePath}`);
  }
  /**
   * Load a shared resource in the back-end (translation, template, etc.).
   * Search for the specified file path in both the Lambda function's main folder and the layers folder.
   */
  loadSharedResource(filePath: string): string {
    let path: string = null;

    if (existsSync(`assets/${filePath}`)) path = `assets/${filePath}`;
    else if (existsSync(`/opt/nodejs/assets/${filePath}`)) path = `/opt/nodejs/assets/${filePath}`;

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
  async invokeInternalAPIRequest(params: InternalAPIRequestParams): Promise<any> {
    if (params.lambda) return await this.invokeInternalAPIRequestWithLambda(params);
    if (params.eventBridge) return await this.invokeInternalAPIRequestWithEventBridge(params);
    throw new Error('Either "lambda" or "eventBus" parameters must be set.');
  }
  private async invokeInternalAPIRequestWithLambda(params: InternalAPIRequestParams): Promise<any> {
    const lambdaInvokeParams = {
      FunctionName: params.lambda,
      InvocationType: 'RequestResponse',
      Payload: this.mapEventForInternalApiRequest(params),
      Qualifier: params.stage || this.stage
    };
    const res = await new Lambda().invoke(lambdaInvokeParams).promise();
    const payload = JSON.parse(res.Payload as string);
    const body = JSON.parse(payload.body);
    if (Number(payload.statusCode) !== 200) throw new Error(body.message);
    return body;
  }
  private async invokeInternalAPIRequestWithEventBridge(
    params: InternalAPIRequestParams
  ): Promise<EventBridge.PutEventsResponse> {
    const request = {
      EventBusName: params.eventBridge.bus,
      Source: this.constructor.name,
      DetailType: params.eventBridge.target,
      Detail: this.mapEventForInternalApiRequest(params)
    };
    return await new EventBridge().putEvents({ Entries: [request] }).promise();
  }
  private mapEventForInternalApiRequest(params: InternalAPIRequestParams): string {
    const event = JSON.parse(JSON.stringify(this.event));

    // change only the event attributes we need; e.g. the authorization is unchanged
    if (!event.requestContext) event.requestContext = {};
    event.requestContext.stage = params.stage || this.stage;
    if (!event.requestContext.http) event.requestContext.http = {};
    event.requestContext.http.method = event.httpMethod = params.httpMethod;
    event.routeKey = event.resource = params.resource;
    event.pathParameters = params.pathParams || {};
    event.queryStringParameters = params.queryParams || {};
    event.body = JSON.stringify(params.body || {});
    event.rawPath = event.path = params.resource;
    for (const p in event.pathParameters)
      if (event.pathParameters[p]) event.rawPath = event.path = event.path.replace(`{${p}}`, event.pathParameters[p]);
    // set a flag to make the invoked to recognise that is an internal request
    event.internalAPIRequest = true;

    return JSON.stringify(event);
  }
  /**
   * Whether the current request comes from an internal API request, i.e. it was invoked by another controller.
   * @deprecated don't run a Lambda from another Lambda (bad practice)
   */
  comesFromInternalRequest(): boolean {
    return Boolean((this.event as any).internalAPIRequest);
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
   * `"This is a {{ key }}"` ==> `"This is a value", with params = { key: "value" }`.
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
   * `getValue({ key1: { keyA: 'valueI' }}, 'key1.keyA')` ==> `'valueI'`.
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
 * @deprecated don't run a Lambda from another Lambda (bad practice).
 */
export interface InternalAPIRequestParams {
  /**
   * The name of the Lambda function receiving the request; e.g. `project_memberships`.
   * Note: the invocation is always syncronous.
   * Either this attribute or `eventBus` must be set.
   */
  lambda?: string;
  /**
   * The EventBridge destination of the request.
   * If the bus name or ARN isn't specified, the default one is used.
   * The `target` maps into the `DetailType` of the event.
   * Note: the invocation is always asyncronous.
   * Either this attribute or `lambda` must be set.
   */
  eventBridge?: { bus?: string; target?: string };
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

/**
 * Explicitly define a specific type of error to use in the RC's handler, to distinguish it from the normal errors.
 */
export class RCError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, RCError.prototype);
  }
}
