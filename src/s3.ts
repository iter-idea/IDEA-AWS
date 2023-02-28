import { S3 as AWSS3 } from 'aws-sdk';
import { SignedURL } from 'idea-toolbox';

import { Logger } from './logger';

/**
 * A wrapper for AWS Simple Storage Service.
 */
export class S3 {
  protected s3: AWSS3;

  protected DEFAULT_DOWNLOAD_BUCKET_PREFIX = 'common';
  protected DEFAULT_DOWNLOAD_BUCKET = 'idea-downloads';
  protected DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP = 180;
  protected DEFAULT_UPLOAD_BUCKET_SEC_TO_EXP = 300;

  logger = new Logger();

  constructor(options: { debug: boolean } = { debug: true }) {
    this.s3 = new AWSS3({ apiVersion: '2006-03-01', signatureVersion: 'v4' });
    this.logger.level = options.debug ? 'DEBUG' : 'INFO';
  }

  /**
   * Create a download link of a piece of data (through S3).
   * *Practically*, it uploads the file on an S3 bucket, generating and returning a url to it.
   */
  async createDownloadURLFromData(data: Buffer | any, options?: CreateDownloadURLFromDataOptions): Promise<SignedURL> {
    // if needed, randomly generates the key
    if (!options.key) options.key = new Date().getTime().toString().concat(Math.random().toString(36).slice(2));

    options.key = `${options.prefix || this.DEFAULT_DOWNLOAD_BUCKET_PREFIX}/${options.key}`;
    options.bucket = options.bucket || this.DEFAULT_DOWNLOAD_BUCKET;
    options.secToExp = options.secToExp || this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP;

    await this.s3
      .upload({ Bucket: options.bucket, Key: options.key, Body: data, ContentType: options.contentType })
      .promise();

    return this.signedURLGet(options.bucket, options.key, options.secToExp);
  }

  /**
   * Get a signed URL to put a file on a S3 bucket.
   * @param expires seconds after which the signed URL expires
   */
  signedURLPut(bucket: string, key: string, expires?: number): SignedURL {
    return new SignedURL({
      url: this.s3.getSignedUrl('putObject', {
        Bucket: bucket,
        Key: key,
        Expires: expires || this.DEFAULT_UPLOAD_BUCKET_SEC_TO_EXP
      })
    });
  }

  /**
   * Get a signed URL to get a file on a S3 bucket.
   * @param expires seconds after which the signed URL expires
   */
  signedURLGet(bucket: string, key: string, expires?: number): SignedURL {
    return new SignedURL({
      url: this.s3.getSignedUrl('getObject', {
        Bucket: bucket,
        Key: key,
        Expires: expires || this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP
      })
    });
  }

  /**
   * Make a copy of an object of the bucket.
   */
  async copyObject(options: CopyObjectOptions): Promise<void> {
    this.logger.debug(`S3 copy object: ${options.key}`);
    await this.s3.copyObject({ CopySource: options.copySource, Bucket: options.bucket, Key: options.key }).promise();
  }

  /**
   * Get an object from a S3 bucket.
   */
  async getObject(options: GetObjectOptions): Promise<any> {
    this.logger.debug(`S3 get object: ${options.key}`);
    const result = await this.s3.getObject({ Bucket: options.bucket, Key: options.key }).promise();

    switch (options.type) {
      case GetObjectTypes.JSON:
        return JSON.parse(result.Body.toString('utf-8'));
      case GetObjectTypes.TEXT:
        return result.Body.toString('utf-8');
      default:
        return result;
    }
  }

  /**
   * Put an object in a S3 bucket.
   */
  async putObject(options: PutObjectOptions): Promise<AWSS3.PutObjectOutput> {
    const params: any = { Bucket: options.bucket, Key: options.key, Body: options.body };
    if (options.contentType) params.ContentType = options.contentType;
    if (options.acl) params.ACL = options.acl;
    if (options.metadata) params.Metadata = options.metadata;

    this.logger.debug(`S3 put object: ${options.key}`);
    return await this.s3.putObject(params).promise();
  }

  /**
   * Delete an object from an S3 bucket.
   */
  async deleteObject(options: DeleteObjectOptions): Promise<AWSS3.PutObjectOutput> {
    this.logger.debug(`S3 delete object: ${options.key}`);
    return await this.s3.deleteObject({ Bucket: options.bucket, Key: options.key }).promise();
  }

  /**
   * List the objects of an S3 bucket.
   */
  async listObjects(options: ListObjectsOptions): Promise<AWSS3.ListObjectsOutput> {
    this.logger.debug(`S3 list object: ${options.prefix}`);
    return await this.s3.listObjects({ Bucket: options.bucket, Prefix: options.prefix }).promise();
  }

  /**
   * List the objects keys of an S3 bucket.
   */
  async listObjectsKeys(options: ListObjectsOptions): Promise<string[]> {
    const result = await this.listObjects(options);
    return result.Contents.map(obj => obj.Key);
  }

  /**
   * Check whether an object on an S3 bucket exists.
   */
  async doesObjectExist(options: GetObjectOptions): Promise<boolean> {
    try {
      await this.s3.headObject({ Bucket: options.bucket, Key: options.key }).promise();
      return true;
    } catch (err) {
      return false;
    }
  }
}

/**
 * Options for creating a download URL.
 */
export interface CreateDownloadURLFromDataOptions {
  /**
   * Downloads bucket; default: `idea-downloads`.
   */
  bucket?: string;
  /**
   * Folder (e.g. the project name); default: `common`.
   */
  prefix?: string;
  /**
   * The unique filepath in which to store the file; default: _random_.
   */
  key?: string;
  /**
   * Content type, e.g. application/json; default: _guessed_.
   */
  contentType?: string;
  /**
   * Seconds to URL expiration; default: `180`.
   */
  secToExp?: number;
}

/**
 * Options for copying an object.
 */
export interface CopyObjectOptions {
  /**
   * The source path (complete with the bucket name).
   */
  copySource: string;
  /**
   * The bucket in which to copy the file.
   */
  bucket: string;
  /**
   * The complete filepath of the bucket in which to copy the file.
   */
  key: string;
}

/**
 * Options for getting an object.
 */
export interface GetObjectOptions {
  /**
   * The bucket from which to acquire the file.
   */
  bucket: string;
  /**
   * The complete filepath of the bucket from which to acquire the file.
   */
  key: string;
  /**
   * Enum: JSON; useful to cast the result.
   */
  type?: GetObjectTypes;
}

/**
 * The managed types to convert objects coming from an S3 bucket.
 */
export enum GetObjectTypes {
  JSON = 'JSON',
  TEXT = 'TEXT'
}

/**
 * Options for putting an object.
 */
export interface PutObjectOptions {
  /**
   * The bucket in which to copy the file.
   */
  bucket: string;
  /**
   * The complete filepath of the bucket in which to copy the file.
   */
  key: string;
  /**
   * The content of the file.
   */
  body: any;
  /**
   * Content type (e.g. image/png).
   */
  contentType?: string;
  /**
   * Access-control list (e.g. public-read).
   */
  acl?: string;
  /**
   * A set of metadata as attributes
   */
  metadata?: any;
}

/**
 * Options for deleting an object.
 */
export interface DeleteObjectOptions {
  /**
   * The bucket from which to delete the file.
   */
  bucket: string;
  /**
   * The complete filepath to the file to delete.
   */
  key: string;
}

/**
 * Options for listing a bucket's objects.
 */
export interface ListObjectsOptions {
  /**
   * The bucket from which to list the objects.
   */
  bucket: string;
  /**
   * The prefix to filter the objects to select, based on the key.
   */
  prefix?: string;
}
