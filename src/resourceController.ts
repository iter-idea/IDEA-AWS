import { existsSync, readFileSync } from 'fs';
import * as Lambda from '@aws-sdk/client-lambda';
import * as EventBridge from '@aws-sdk/client-eventbridge';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { APIGatewayProxyEventV2, APIGatewayProxyEvent, Callback } from 'aws-lambda';
import { APIRequestLog, CognitoUser, Auth0User } from 'idea-toolbox';

import { CloudWatchMetrics } from './metrics';
import { GenericController, HandledError, UnhandledError } from './genericController';
import { DynamoDB } from './dynamoDB';

const ENV = process?.env ?? {};
const { PROJECT, STAGE, RESOURCE } = ENV;
ENV.POWERTOOLS_SERVICE_NAME = [PROJECT, STAGE, RESOURCE].filter(x => x).join('_');

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
  protected auth0User: Auth0User;

  protected project = PROJECT;
  protected stage = STAGE;
  protected httpMethod: string;
  protected body: any;
  protected queryParams: any;
  protected resourcePath: string;
  protected path: string;
  protected pathParameters: any;
  protected resource = RESOURCE;
  protected resourceId: string;

  protected clientVersion = '?';
  protected clientPlatform = '?';
  protected clientBundle: string = null;

  protected returnStatusCode?: number;

  protected logRequestsWithKey: string;

  protected metrics: CloudWatchMetrics;

  protected tracer: Tracer;
  protected tracerLambdaSegment: any;
  protected tracerRCSegment: any;

  protected currentLang: string;
  protected defaultLang: string;
  protected translations: any;
  protected templateMatcher = /{{\s?([^{}\s]*)\s?}}/g;

  constructor(
    event: APIGatewayProxyEventV2 | APIGatewayProxyEvent,
    callback: Callback,
    options: ResourceControllerOptions = {}
  ) {
    super(event, callback);

    this.event = event;
    this.callback = callback;

    try {
      if ((event as APIGatewayProxyEventV2).version === '2.0')
        this.initFromEventV2(event as APIGatewayProxyEventV2, options);
      else this.initFromEventV1(event as APIGatewayProxyEvent, options);

      this.logRequestsWithKey = options.logRequestsWithKey;

      this.tracer = options.tracer;

      // acquire some info about the client, if available
      if (this.queryParams['_v']) {
        this.clientVersion = this.queryParams['_v'];
        delete this.queryParams['_v'];
      }
      if (this.queryParams['_p']) {
        this.clientPlatform = this.queryParams['_p'];
        delete this.queryParams['_p'];
      }
      if (this.queryParams['_b']) {
        this.clientBundle = this.queryParams['_b'];
        delete this.queryParams['_b'];
      }

      if (options.useMetrics) this.prepareMetrics();
    } catch (err) {
      this.initError = true;
      this.done(this.handleControllerError(err, 'INIT-ERROR', 'Malformed request'));
    }
  }
  private initFromEventV2(event: APIGatewayProxyEventV2, options: ResourceControllerOptions): void {
    this.authorization = event.headers.authorization;
    const authorizer = (event.requestContext as any)?.authorizer ?? {};
    const contextFromAuthorizer = authorizer.lambda ?? authorizer.jwt?.claims ?? {};
    this.principalId = contextFromAuthorizer.principalId ?? contextFromAuthorizer.sub ?? null;
    this.cognitoUser = authorizer.jwt?.claims ? new CognitoUser(authorizer.jwt?.claims) : null;
    this.auth0User = contextFromAuthorizer.auth0User ? new Auth0User(contextFromAuthorizer.auth0User) : null;

    this.stage = this.stage ?? event.requestContext.stage;
    this.httpMethod = event.requestContext.http.method;
    this.resourcePath = event.routeKey.replace('+', ''); // {proxy+} -> {proxy}
    this.path = event.rawPath;
    this.pathParameters = {};
    for (const param in event.pathParameters)
      this.pathParameters[param] = event.pathParameters[param] ? decodeURIComponent(event.pathParameters[param]) : null;
    this.resourceId = this.pathParameters[options.resourceId || 'proxy'];
    this.queryParams = event.queryStringParameters || {};
    try {
      this.body = (event.body ? JSON.parse(event.body) : {}) || {};
    } catch (error) {
      throw new HandledError('Malformed body');
    }
  }
  private initFromEventV1(event: APIGatewayProxyEvent, options: ResourceControllerOptions): void {
    this.authorization = event.headers.Authorization;
    this.claims = event.requestContext.authorizer?.claims || {};
    this.principalId = this.claims.sub;
    this.cognitoUser = this.principalId ? new CognitoUser(this.claims) : null;
    this.auth0User = null;

    this.stage = this.stage ?? event.requestContext.stage;
    this.httpMethod = event.httpMethod;
    this.resourcePath = event.resource.replace('+', ''); // {proxy+} -> {proxy}
    this.path = event.path;
    this.pathParameters = {};
    for (const param in event.pathParameters)
      this.pathParameters[param] = event.pathParameters[param] ? decodeURIComponent(event.pathParameters[param]) : null;
    this.resourceId = this.pathParameters[options.resourceId || 'proxy'];
    this.queryParams = event.queryStringParameters || {};
    try {
      this.body = (event.body ? JSON.parse(event.body) : {}) || {};
    } catch (error) {
      throw new HandledError('Malformed body');
    }
  }
  protected getEventSummary(): Record<string, any> {
    return {
      httpMethod: this.httpMethod,
      path: this.path,
      principalId: this.principalId,
      queryParams: this.queryParams,
      body: this.body,
      version: this.clientVersion,
      platform: this.clientPlatform,
      bundle: this.clientBundle
    };
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

    this.logger.info('START', { event: this.getEventSummary() });

    if (this.tracer) {
      this.tracerLambdaSegment = this.tracer.getSegment();
      if (this.tracerLambdaSegment) {
        this.tracerRCSegment = this.tracerLambdaSegment.addNewSubsegment('RC');
        this.tracer.setSegment(this.tracerRCSegment);
      }
      this.tracer.annotateColdStart();
      this.tracer.addServiceNameAnnotation();
      this.tracer.putMetadata('START', { event: this.getEventSummary() });
    }

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
              this.done(new HandledError('Unsupported method'));
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
              this.done(new HandledError('Unsupported method'));
          }
        }

        this.done(null, response);
      } catch (err) {
        this.done(this.handleControllerError(err, 'HANDLER-ERROR', 'Operation failed'));
      }
    } catch (err) {
      this.done(this.handleControllerError(err, 'AUTH-CHECK-ERROR', 'Forbidden'));
    }
  };
  protected done(
    error?: Error | any,
    rawResult?: any,
    statusCode = this.returnStatusCode ?? (error ? 400 : 200)
  ): void {
    const result = error ? { message: error.message } : rawResult ?? {};

    const responseTrace = { result: Array.isArray(result) ? { array: result.length } : result };
    this.logger.debug('END-DETAIL', responseTrace);
    if (this.tracer) this.tracer.addResponseAsMetadata(responseTrace, 'END-DETAIL');

    const finalLogContent = { statusCode, event: this.getEventSummary() };
    if (error) {
      if ((error as UnhandledError).unhandled) this.logger.error('END-FAILED', error, finalLogContent);
      else this.logger.warn('END-FAILED', error, finalLogContent);
      if (this.tracer) this.tracer.addErrorAsMetadata(error);
    } else this.logger.info('END-SUCCESS', finalLogContent);

    if (this.tracer) {
      if (this.tracerRCSegment) this.tracerRCSegment.close();
      if (this.tracerLambdaSegment) this.tracer.setSegment(this.tracerLambdaSegment);
    }

    if (this.logRequestsWithKey) this.storeLog(!error);

    if (this.metrics) this.publishMetrics(statusCode, error);

    this.callback(null, {
      statusCode: String(statusCode),
      body: JSON.stringify(result),
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
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async postResource(): Promise<any> {
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async putResource(): Promise<any> {
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async deleteResource(): Promise<any> {
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async headResource(): Promise<any> {
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async getResources(): Promise<any> {
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async postResources(): Promise<any> {
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async putResources(): Promise<any> {
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async patchResource(): Promise<any> {
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async patchResources(): Promise<any> {
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async deleteResources(): Promise<any> {
    throw new HandledError('Unsupported method');
  }
  /**
   * To @override
   */
  protected async headResources(): Promise<any> {
    throw new HandledError('Unsupported method');
  }

  ///
  /// HELPERS
  ///

  /**
   * Store the log associated to the request (no response/error handling).
   */
  protected async storeLog(succeeded: boolean): Promise<void> {
    const log = new APIRequestLog({
      logId: this.logRequestsWithKey,
      userId: this.principalId,
      resource: this.resourcePath,
      path: this.path,
      resourceId: this.resourceId,
      method: this.httpMethod,
      succeeded
    });

    // optionally add a track of the action
    if (this.httpMethod === 'PATCH' && this.body && this.body.action) log.action = this.body.action;

    try {
      await new DynamoDB().put({ TableName: 'idea_logs', Item: log });
    } catch (error) {
      // ignore
    }
  }
  /**
   * Check whether shared resource exists in the back-end (translation, template, etc.).
   * Search for the specified file path in both the Lambda function's main folder and the layers folder.
   */
  protected sharedResourceExists(filePath: string): boolean {
    return existsSync(`assets/${filePath}`) || existsSync(`/opt/nodejs/assets/${filePath}`);
  }
  /**
   * Load a shared resource in the back-end (translation, template, etc.).
   * Search for the specified file path in both the Lambda function's main folder and the layers folder.
   */
  protected loadSharedResource(filePath: string): string {
    let path: string = null;

    if (existsSync(`assets/${filePath}`)) path = `assets/${filePath}`;
    else if (existsSync(`/opt/nodejs/assets/${filePath}`)) path = `/opt/nodejs/assets/${filePath}`;

    return path ? readFileSync(path, { encoding: 'utf-8' }) : null;
  }

  /**
   * Prepare the CloudWatch metrics at the beginning of a request.
   */
  protected prepareMetrics(): void {
    this.metrics = new CloudWatchMetrics({ project: this.project });
    this.metrics.addDimension('stage', this.stage);
    this.metrics.addDimension('resource', this.resource);
    this.metrics.addDimension('method', this.httpMethod);
    this.metrics.addDimension('target', this.resourceId ? 'id' : 'list');
    this.metrics.addDimension('action', this.body?.action);
    this.metrics.addDimension('userId', this.principalId);
    this.metrics.addDimension('clientVersion', this.clientVersion);
    this.metrics.addDimension('clientPlatform', this.clientPlatform);
    this.metrics.addDimension('clientBundle', this.clientBundle ?? '-');
    this.metrics.addMetadata('resourceId', this.resourceId);
  }
  /**
   * Publish the CloudWatch metrics (default and custom-defined) at the end of a reqeust.
   */
  protected publishMetrics(statusCode: number, error?: any): void {
    if (!this.metrics) return;
    this.metrics.addMetric('request');
    this.metrics.addMetric('statusCode', statusCode);
    if (error) {
      this.metrics.addMetric('failed');
      this.metrics.addMetadata('error', error.name);
    } else this.metrics.addMetric('success');
    this.metrics.publishStoredMetrics();
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
    const command = new Lambda.InvokeCommand({
      FunctionName: params.lambda,
      InvocationType: 'RequestResponse',
      Payload: this.mapEventForInternalApiRequest(params),
      Qualifier: params.stage ?? this.stage
    });
    const client = new Lambda.LambdaClient();
    const { Payload } = await client.send(command);
    const payload = JSON.parse(Buffer.from(Payload).toString());
    const body = JSON.parse(payload.body);
    if (Number(payload.statusCode) !== 200) throw new Error(body.message);
    return body;
  }
  private async invokeInternalAPIRequestWithEventBridge(
    params: InternalAPIRequestParams
  ): Promise<EventBridge.PutEventsCommandOutput> {
    const request = {
      EventBusName: params.eventBridge.bus,
      Source: this.constructor.name,
      DetailType: params.eventBridge.target,
      Detail: this.mapEventForInternalApiRequest(params)
    };
    const client = new EventBridge.EventBridgeClient();
    const command = new EventBridge.PutEventsCommand({ Entries: [request] });
    return await client.send(command);
  }
  private mapEventForInternalApiRequest(params: InternalAPIRequestParams): string {
    const event = JSON.parse(JSON.stringify(this.event));

    // change only the event attributes we need; e.g. the authorization is unchanged
    if (!event.requestContext) event.requestContext = {};
    event.requestContext.stage = params.stage ?? this.stage;
    if (!event.requestContext.http) event.requestContext.http = {};
    event.requestContext.http.method = event.httpMethod = params.httpMethod;
    event.routeKey = event.resource = params.resource;
    event.pathParameters = params.pathParams ?? {};
    event.queryStringParameters = params.queryParams ?? {};
    event.body = JSON.stringify(params.body ?? {});
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
  loadTranslations(lang: string, defLang?: string): void {
    // check for the existance of the mandatory source file
    if (!this.sharedResourceExists(`i18n/${lang}.json`)) return;
    // set the languages
    this.currentLang = lang;
    this.defaultLang = defLang ?? lang;
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
export interface ResourceControllerOptions {
  /**
   * The resourceId of the API request, to specify if different from "proxy".
   */
  resourceId?: string;
  /**
   * If set, the logs of the API requests on this resource will be stored (using this key).
   */
  logRequestsWithKey?: string;
  /**
   * Whether to automatically store usage metrics on CloudWatch.
   */
  useMetrics?: boolean;
  /**
   * The instance of the tracer to use in case of advanced monitoring.
   */
  tracer?: Tracer;
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
