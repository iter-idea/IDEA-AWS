import * as AWSS3 from '@aws-sdk/client-s3';
import { Upload, BodyDataTypes } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SignedURL } from 'idea-toolbox';

import { LambdaLogger } from './lambdaLogger';

/**
 * A wrapper for AWS Simple Storage Service.
 */
export class S3 {
  client: AWSS3.S3Client;
  protected logger = new LambdaLogger();

  protected DEFAULT_DOWNLOAD_BUCKET_PREFIX = 'common';
  protected DEFAULT_DOWNLOAD_BUCKET = 'idea-downloads';
  protected DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP = 180;
  protected DEFAULT_UPLOAD_BUCKET_SEC_TO_EXP = 300;

  constructor() {
    this.client = new AWSS3.S3Client();
  }

  /**
   * Create a download link of a piece of data (through S3).
   * *Practically*, it uploads the file on an S3 bucket, generating and returning a url to it.
   */
  async createDownloadURLFromData(
    data: BodyDataTypes,
    options: CreateDownloadURLFromDataOptions = {}
  ): Promise<SignedURL> {
    // if needed, randomly generates the key
    if (!options.key) options.key = Date.now().toString().concat(Math.random().toString(36).slice(2));

    options.key = `${options.prefix ?? this.DEFAULT_DOWNLOAD_BUCKET_PREFIX}/${options.key}`;
    options.bucket = options.bucket ?? this.DEFAULT_DOWNLOAD_BUCKET;
    options.secToExp = options.secToExp ?? this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP;

    const params = { Bucket: options.bucket, Key: options.key, Body: data, ContentType: options.contentType };
    const upload = new Upload({ client: this.client, params });
    await upload.done();

    return this.signedURLGet(options.bucket, options.key, { secToExp: options.secToExp, filename: options.filename });
  }

  /**
   * Get a signed URL to put a file on a S3 bucket.
   */
  async signedURLPut(bucket: string, key: string, options: SignedURLOptions = {}): Promise<SignedURL> {
    const putParams: AWSS3.PutObjectCommandInput = { Bucket: bucket, Key: key };
    if (options.filename) putParams.ContentDisposition = `attachment; filename ="${cleanFilename(options.filename)}"`;
    const expiresIn = options.secToExp ?? this.DEFAULT_UPLOAD_BUCKET_SEC_TO_EXP;

    const url = await getSignedUrl(this.client, new AWSS3.PutObjectCommand(putParams), { expiresIn });
    return new SignedURL({ url });
  }

  /**
   * Get a signed URL to get a file on a S3 bucket.
   */
  async signedURLGet(bucket: string, key: string, options: SignedURLOptions = {}): Promise<SignedURL> {
    const getParams: AWSS3.GetObjectCommandInput = { Bucket: bucket, Key: key };
    if (options.filename)
      getParams.ResponseContentDisposition = `attachment; filename ="${cleanFilename(options.filename)}"`;
    const expiresIn = options.secToExp ?? this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP;

    const url = await getSignedUrl(this.client, new AWSS3.GetObjectCommand(getParams), { expiresIn });
    return new SignedURL({ url });
  }

  /**
   * Make a copy of an object of the bucket.
   */
  async copyObject(options: CopyObjectOptions): Promise<void> {
    this.logger.trace(`S3 copy object: ${options.key}`);
    const command = new AWSS3.CopyObjectCommand({
      CopySource: options.copySource,
      Bucket: options.bucket,
      Key: options.key
    });
    await this.client.send(command);
  }

  /**
   * Get an object from a S3 bucket.
   */
  async getObject(options: GetObjectOptions): Promise<AWSS3.GetObjectCommandOutput> {
    this.logger.trace(`S3 get object: ${options.key}`);

    const params: AWSS3.GetObjectCommandInput = { Bucket: options.bucket, Key: options.key };
    if (options.filename)
      params.ResponseContentDisposition = `attachment; filename ="${cleanFilename(options.filename)}"`;

    const command = new AWSS3.GetObjectCommand(params);
    return await this.client.send(command);
  }
  /**
   * Get an object from a S3 bucket and parse the content as a JSON object.
   */
  async getObjectAsJSON(options: GetObjectOptions): Promise<any> {
    const result = await this.getObject(options);
    return JSON.parse(await result.Body.transformToString('utf-8'));
  }
  /**
   * Get an object from a S3 bucket and convert the content to string.
   */
  async getObjectAsText(options: GetObjectOptions): Promise<string> {
    const result = await this.getObject(options);
    return await result.Body.transformToString('utf-8');
  }

  /**
   * Put an object in a S3 bucket.
   */
  async putObject(options: PutObjectOptions): Promise<AWSS3.PutObjectOutput> {
    const params: AWSS3.PutObjectCommandInput = { Bucket: options.bucket, Key: options.key, Body: options.body };
    if (options.contentType) params.ContentType = options.contentType;
    if (options.acl) params.ACL = options.acl;
    if (options.metadata) params.Metadata = options.metadata;
    if (options.filename) params.ContentDisposition = `attachment; filename ="${cleanFilename(options.filename)}"`;

    this.logger.trace(`S3 put object: ${options.key}`);
    return await this.client.send(new AWSS3.PutObjectCommand(params));
  }

  /**
   * Delete an object from an S3 bucket.
   */
  async deleteObject(options: DeleteObjectOptions): Promise<AWSS3.PutObjectOutput> {
    this.logger.trace(`S3 delete object: ${options.key}`);
    const deleteCommand = new AWSS3.DeleteObjectCommand({ Bucket: options.bucket, Key: options.key });
    return await this.client.send(deleteCommand);
  }

  /**
   * List the objects of an S3 bucket.
   */
  async listObjects(options: ListObjectsOptions): Promise<AWSS3.ListObjectsOutput> {
    this.logger.trace(`S3 list object: ${options.prefix}`);
    const command = new AWSS3.ListObjectsCommand({ Bucket: options.bucket, Prefix: options.prefix });
    return await this.client.send(command);
  }

  /**
   * List the objects keys of an S3 bucket.
   */
  async listObjectsKeys(options: ListObjectsOptions): Promise<string[]> {
    const result = await this.listObjects(options);
    return result.Contents.map(obj => obj.Key);
  }

  /**
   * Check whether an object exists in an S3 bucket.
   */
  async doesObjectExist(options: HeadObjectOptions): Promise<boolean> {
    try {
      const command = new AWSS3.HeadObjectCommand({ Bucket: options.bucket, Key: options.key });
      const { ContentLength } = await this.client.send(command);
      if (options.emptyMeansNotFound) return ContentLength > 0;
      else return true;
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
  /**
   * The suggested name for the file once it's downloaded/saved.
   * Note: the string is cleaned to ensure maximum compatibility with every OS.
   */
  filename?: string;
}

/**
 * Options for generating a signed URL.
 */
export interface SignedURLOptions {
  /**
   * Seconds to URL expiration; default: `180` for GET, `300` for PUT.
   */
  secToExp?: number;
  /**
   * The suggested name for the file once it's downloaded/saved.
   * Note: the string is cleaned to ensure maximum compatibility with every OS.
   */
  filename?: string;
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
   * The complete filepath (within the bucket) from which to acquire the file.
   */
  key: string;
  /**
   * The suggested name for the file once it's downloaded/saved.
   * Note: the string is cleaned to ensure maximum compatibility with every OS.
   */
  filename?: string;
}

/**
 * Options for getting the head (main metadata, without the content) of an object.
 */
export interface HeadObjectOptions {
  /**
   * The bucket from which to acquire the file.
   */
  bucket: string;
  /**
   * The complete filepath (within the bucket) from which to acquire the file.
   */
  key: string;
  /**
   * If set, the request will fail in case the object is empty (`ContentLength === 0`).
   */
  emptyMeansNotFound?: boolean;
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
  /**
   * The suggested name for the file once it's downloaded/saved.
   * Note: the string is cleaned to ensure maximum compatibility with every OS.
   */
  filename?: string;
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

/**
 * Clean a filename to be compatible with most OS.
 */
export const cleanFilename = (filename: string): string => filename.replace(/[^a-z0-9-.\s]/gi, '_');
