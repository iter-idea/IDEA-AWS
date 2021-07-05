import { logger } from 'idea-toolbox';

import { DynamoDB } from './dynamoDB';
import { Cognito } from './cognito';
import { S3 } from './s3';
import { SES } from './ses';
import { SNS } from './sns';
import { Translate } from './translate';
import { Comprehend } from './comprehend';

import { Attachments } from './attachments';

/**
 * An abstract class to inherit to manage some resources with an AWS Lambda function.
 */
export abstract class GenericController {
  protected event: any;
  protected callback: any;

  protected _dynamoDB: DynamoDB;
  protected _cognito: Cognito;
  protected _s3: S3;
  protected _ses: SES;
  protected _sns: SNS;
  protected _translate: Translate;
  protected _comprehend: Comprehend;

  protected _attachments: Attachments;

  public tables: any;

  protected logRequestsWithKey: string;

  /**
   * Initialize a new GenericController helper object.
   * @param event the event that invoked the AWS lambda function
   * @param callback the callback to resolve or reject the execution
   */
  constructor(event: any, callback: any, options?: GenericControllerOptions) {
    options = options || ({} as GenericControllerOptions);

    this.event = event;
    this.callback = callback;

    this.tables = options.tables || {};

    // set the logs to print objects deeper
    require('util').inspect.defaultOptions.depth = null;
  }

  /**
   * The main function, that handle the request and should terminate with an invokation of the method `done`.
   */
  public abstract handleRequest(): void;

  /**
   * Default callback for the Lambda.
   */
  protected done(err: Error | null, res?: any) {
    logger(err ? 'DONE WITH ERRORS' : 'DONE', err, res, true);
    this.callback(err, res);
  }

  ///
  /// AWS SERVICES
  ///

  protected get dynamoDB(): DynamoDB {
    if (!this._dynamoDB) this._dynamoDB = new DynamoDB();
    return this._dynamoDB;
  }
  protected set dynamoDB(dynamoDB: DynamoDB) {
    this._dynamoDB = dynamoDB;
  }
  protected get cognito(): Cognito {
    if (!this._cognito) this._cognito = new Cognito();
    return this._cognito;
  }
  protected set cognito(cognito: Cognito) {
    this._cognito = cognito;
  }
  protected get s3(): S3 {
    if (!this._s3) this._s3 = new S3();
    return this._s3;
  }
  protected set s3(s3: S3) {
    this._s3 = s3;
  }
  protected get ses(): SES {
    if (!this._ses) this._ses = new SES();
    return this._ses;
  }
  protected set ses(ses: SES) {
    this._ses = ses;
  }
  protected get sns(): SNS {
    if (!this._sns) this._sns = new SNS();
    return this._sns;
  }
  protected set sns(sns: SNS) {
    this._sns = sns;
  }
  protected get translate(): Translate {
    if (!this._translate) this._translate = new Translate();
    return this._translate;
  }
  protected set translate(translate: Translate) {
    this._translate = translate;
  }
  protected get comprehend(): Comprehend {
    if (!this._comprehend) this._comprehend = new Comprehend();
    return this._comprehend;
  }
  protected set comprehend(comprehend: Comprehend) {
    this._comprehend = comprehend;
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
}

/**
 * The initial options for a constructor of class GenericController.
 */
export interface GenericControllerOptions {
  /**
   * The AWS DDB tables involved, as a map of shortcut and names.
   * e.g. `{ users: 'project_users' }`.
   */
  tables?: { [table: string]: string };
}
