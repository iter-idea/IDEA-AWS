import { gzip as gzipCb, gunzip as gunzipCb } from 'node:zlib';
import { promisify } from 'node:util';
import * as AWSS3 from '@aws-sdk/client-s3';
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
   * The data must be entirely in memory (a string or bytes): the upload is a single PutObject, which needs the
   * content length up front, so streams aren't supported.
   */
  async createDownloadURLFromData(
    data: string | Uint8Array,
    options: CreateDownloadURLFromDataOptions = {}
  ): Promise<SignedURL> {
    // if needed, randomly generates the key
    if (!options.key) options.key = Date.now().toString().concat(Math.random().toString(36).slice(2));

    options.key = `${options.prefix ?? this.DEFAULT_DOWNLOAD_BUCKET_PREFIX}/${options.key}`;
    options.bucket = options.bucket ?? this.DEFAULT_DOWNLOAD_BUCKET;
    options.secToExp = options.secToExp ?? this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP;

    let body: string | Uint8Array = data;
    let contentEncoding = options.contentEncoding;
    if (options.compress) {
      const gzip = promisify(gzipCb);
      body = await gzip(data);
      contentEncoding = 'gzip';
    }

    const params: AWSS3.PutObjectCommandInput = {
      Bucket: options.bucket,
      Key: options.key,
      Body: body,
      ContentType: options.contentType
    };
    if (contentEncoding) params.ContentEncoding = contentEncoding;

    await this.client.send(new AWSS3.PutObjectCommand(params));

    return this.signedURLGet(options.bucket, options.key, { secToExp: options.secToExp, filename: options.filename });
  }

  /**
   * Get a signed URL to put a file on a S3 bucket.
   */
  async signedURLPut(bucket: string, key: string, options: SignedURLPutOptions = {}): Promise<SignedURL> {
    const putParams: AWSS3.PutObjectCommandInput = { Bucket: bucket, Key: key };
    if (options.filename) putParams.ContentDisposition = `attachment; filename ="${cleanFilename(options.filename)}"`;
    if (options.metadata) putParams.Metadata = options.metadata;
    const expiresIn = options.secToExp ?? this.DEFAULT_UPLOAD_BUCKET_SEC_TO_EXP;

    const url = await getSignedUrl(this.client, new AWSS3.PutObjectCommand(putParams), { expiresIn });
    return new SignedURL({ url });
  }

  /**
   * Get a signed URL to get a file on a S3 bucket.
   */
  async signedURLGet(bucket: string, key: string, options: SignedURLGetOptions = {}): Promise<SignedURL> {
    const getParams: AWSS3.GetObjectCommandInput = { Bucket: bucket, Key: key };
    if (options.versionId) getParams.VersionId = options.versionId;
    const disposition = options.inline ? 'inline' : 'attachment';
    if (options.filename)
      getParams.ResponseContentDisposition = `${disposition}; filename ="${cleanFilename(options.filename)}"`;
    else if (options.inline) getParams.ResponseContentDisposition = disposition;
    if (options.contentType) getParams.ResponseContentType = options.contentType;
    const expiresIn = options.secToExp ?? this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP;

    const url = await getSignedUrl(this.client, new AWSS3.GetObjectCommand(getParams), { expiresIn });
    return new SignedURL({ url });
  }

  /**
   * Make a copy of an object of the bucket. In a versioned bucket, the output carries the version the copy created.
   */
  async copyObject(options: CopyObjectOptions): Promise<AWSS3.CopyObjectCommandOutput> {
    this.logger.trace(`S3 copy object: ${options.key}`);
    const params: AWSS3.CopyObjectCommandInput = {
      CopySource: options.copySource,
      Bucket: options.bucket,
      Key: options.key
    };
    if (options.contentType || options.metadata) {
      params.MetadataDirective = 'REPLACE';
      if (options.contentType) params.ContentType = options.contentType;
      if (options.metadata) params.Metadata = options.metadata;
    }
    return await this.client.send(new AWSS3.CopyObjectCommand(params));
  }

  /**
   * Get an object from a S3 bucket.
   */
  async getObject(options: GetObjectOptions): Promise<AWSS3.GetObjectCommandOutput> {
    this.logger.trace(`S3 get object: ${options.key}`);

    const params: AWSS3.GetObjectCommandInput = { Bucket: options.bucket, Key: options.key };
    if (options.versionId) params.VersionId = options.versionId;
    if (options.range) params.Range = `bytes=${options.range.start}-${options.range.end}`;
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
   * If the object was stored with `Content-Encoding: gzip`, it is decompressed transparently.
   */
  async getObjectAsText(options: GetObjectOptions): Promise<string> {
    const result = await this.getObject(options);
    if (result.ContentEncoding === 'gzip') {
      const gunzip = promisify(gunzipCb);
      const compressed = await result.Body.transformToByteArray();
      return (await gunzip(Buffer.from(compressed))).toString('utf-8');
    }
    return await result.Body.transformToString('utf-8');
  }

  /**
   * Put an object in a S3 bucket.
   */
  async putObject(options: PutObjectOptions): Promise<AWSS3.PutObjectOutput> {
    const params: AWSS3.PutObjectCommandInput = { Bucket: options.bucket, Key: options.key, Body: options.body };
    if (options.contentType) params.ContentType = options.contentType;
    if (options.contentEncoding) params.ContentEncoding = options.contentEncoding;
    if (options.acl) params.ACL = options.acl as AWSS3.ObjectCannedACL;
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
    return result.Contents ? result.Contents.map(obj => obj.Key) : [];
  }

  /**
   * List every version of the objects of a versioned S3 bucket (or of a prefix of it), and the delete markers left by
   * the deletions: all of them, page after page.
   */
  async listObjectVersions(options: ListObjectsOptions): Promise<ObjectVersions> {
    this.logger.trace(`S3 list object versions: ${options.prefix}`);
    const result: ObjectVersions = { versions: [], deleteMarkers: [] };
    let page: AWSS3.ListObjectVersionsCommandOutput;
    do {
      const command = new AWSS3.ListObjectVersionsCommand({
        Bucket: options.bucket,
        Prefix: options.prefix,
        KeyMarker: page?.NextKeyMarker,
        VersionIdMarker: page?.NextVersionIdMarker
      });
      page = await this.client.send(command);
      result.versions.push(...(page.Versions ?? []));
      result.deleteMarkers.push(...(page.DeleteMarkers ?? []));
    } while (page.IsTruncated);
    return result;
  }

  /**
   * Get the head of an object of an S3 bucket (its size, type and metadata, without the content).
   * It fails when the object doesn't exist.
   */
  async headObject(options: HeadObjectOptions): Promise<AWSS3.HeadObjectCommandOutput> {
    this.logger.trace(`S3 head object: ${options.key}`);
    const params: AWSS3.HeadObjectCommandInput = { Bucket: options.bucket, Key: options.key };
    if (options.versionId) params.VersionId = options.versionId;
    return await this.client.send(new AWSS3.HeadObjectCommand(params));
  }

  /**
   * Check whether an object exists in an S3 bucket.
   */
  async doesObjectExist(options: HeadObjectOptions): Promise<boolean> {
    try {
      const { ContentLength } = await this.headObject(options);
      if (options.emptyMeansNotFound) return ContentLength > 0;
      else return true;
    } catch (_) {
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
   * If true, the body is gzipped with `Content-Encoding: gzip`. Browsers and `fetch` decompress transparently.
   * Recommended for text/JSON payloads over ~50 KB; for already-compressed binaries (images, zip, etc.) leave it off.
   */
  compress?: boolean;
  /**
   * Explicit `Content-Encoding` to store on the object (e.g., `'gzip'`, `'br'`).
   * Use this when the body is already compressed. Ignored when `compress: true` (in that case `'gzip'` is forced).
   */
  contentEncoding?: string;
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
 * Options for generating a signed URL to get a file.
 */
export interface SignedURLGetOptions extends SignedURLOptions {
  /**
   * A version of the object, in a versioned bucket; default: the current one.
   */
  versionId?: string;
  /**
   * If true, the browser shows the file (e.g. a PDF in its viewer) instead of downloading it.
   */
  inline?: boolean;
  /**
   * The content type the file is served with, whatever the one it was stored with.
   */
  contentType?: string;
}

/**
 * Options for generating a signed URL to put a file.
 */
export interface SignedURLPutOptions extends SignedURLOptions {
  /**
   * A set of metadata to store, as attributes, with the uploaded file.
   * They travel in the signed URL: the client sends no extra header and can't alter them. S3 constraints:
   * - keys are stored lowercase (`templateId` is read back as `templateid`): use lowercase keys;
   * - prefer ASCII values (e.g. IDs): non-ASCII ones are returned RFC 2047-encoded;
   * - keys and values take at most 2 KB altogether: beyond, the client's upload fails (not the URL's generation);
   * - the values are readable in the URL: no sensitive data.
   */
  metadata?: Record<string, string>;
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
  /**
   * The content type of the copy, in place of the source's.
   * With this or `metadata`, the copy takes only what's given here: what isn't given is reset (the content type to
   * `binary/octet-stream`), instead of being copied from the source.
   */
  contentType?: string;
  /**
   * The metadata of the copy, in place of the source's (see `contentType`). The S3 constraints of `SignedURLPutOptions`
   * apply.
   */
  metadata?: Record<string, string>;
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
   * A version of the object, in a versioned bucket; default: the current one.
   */
  versionId?: string;
  /**
   * A part of the object, from its byte `start` to its byte `end` (both included), instead of the whole of it: e.g.
   * the first bytes, to check what kind of file it is without downloading it.
   */
  range?: { start: number; end: number };
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
   * A version of the object, in a versioned bucket; default: the current one.
   */
  versionId?: string;
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
   * `Content-Encoding` header to store on the object (e.g., `'gzip'`).
   * The body is uploaded as-is; the caller is responsible for pre-compressing it.
   */
  contentEncoding?: string;
  /**
   * Access-control list (e.g. public-read).
   */
  acl?: AWSS3.ObjectCannedACL | string;
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
 * The versions of the objects of a versioned bucket, and its delete markers.
 */
export interface ObjectVersions {
  /**
   * Every version of every object, the current ones (`IsLatest`) included.
   */
  versions: AWSS3.ObjectVersion[];
  /**
   * The markers left by the deletions: an object whose latest entry is a marker has no current version.
   */
  deleteMarkers: AWSS3.DeleteMarkerEntry[];
}

/**
 * Clean a filename to be compatible with most OS.
 */
export const cleanFilename = (filename: string): string => filename.replace(/[^a-z0-9-.\s]/gi, '_');
