import { S3 as AWSS3 } from 'aws-sdk';
import { logger, SignedURL } from 'idea-toolbox';

/**
 * A wrapper for AWS Simple Storage Service.
 */
export class S3 {
  protected s3: AWSS3;

  protected DEFAULT_DOWNLOAD_BUCKET_PREFIX = 'common';
  protected DEFAULT_DOWNLOAD_BUCKET = 'idea-downloads';
  protected DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP = 180;
  protected DEFAULT_UPLOAD_BUCKET_SEC_TO_EXP = 300;

  /**
   * Initialize a new S3 helper object.
   */
  constructor() {
    this.s3 = new AWSS3({ apiVersion: '2006-03-01', signatureVersion: 'v4' });
  }

  /**
   * Create a download link of a piece of data (through S3).
   * *Pratically*, it uploads the file on an S3 bucket, generating and returning a url to it.
   */
  public createDownloadURLFromData(data: Buffer | any, options?: CreateDownloadURLFromDataOptions): Promise<SignedURL> {
    return new Promise((resolve, reject) => {
      // if needed, randomly generates the key
      if (!options.key) options.key = new Date().getTime().toString().concat(Math.random().toString(36).slice(2));
      // add the prefix to the key
      options.key = `${options.prefix || this.DEFAULT_DOWNLOAD_BUCKET_PREFIX}/${options.key}`;
      // set the other parameters
      options.bucket = options.bucket || this.DEFAULT_DOWNLOAD_BUCKET;
      options.secToExp = options.secToExp || this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP;
      // upload the file to the downloads bucket
      this.s3.upload(
        {
          Bucket: options.bucket,
          Key: options.key,
          Body: data,
          ContentType: options.contentType
        },
        (err: Error) => {
          logger('S3 UPLOAD', err);
          if (err) reject(err);
          else resolve(this.signedURLGet(options.bucket, options.key, options.secToExp));
        }
      );
    });
  }

  /**
   * Get a signed URL to put a file on a S3 bucket.
   * @param expires seconds after which the signed URL expires
   */
  public signedURLPut(bucket: string, key: string, expires?: number): SignedURL {
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
  public signedURLGet(bucket: string, key: string, expires?: number): SignedURL {
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
  public copyObject(options: CopyObjectOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      this.s3.copyObject({ CopySource: options.copySource, Bucket: options.bucket, Key: options.key }, (err: Error) => {
        logger('S3 COPY OBJECT', err, options.key);
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Get an object from a S3 bucket.
   */
  public getObject(options: GetObjectOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      this.s3.getObject({ Bucket: options.bucket, Key: options.key }, (err: Error, d: AWSS3.GetObjectOutput) => {
        logger('S3 GET OBJECT', err, options.type);
        if (err) reject(err);
        else
          switch (options.type) {
            case GetObjectTypes.JSON:
              resolve(JSON.parse((d.Body as any).toString('utf-8')));
              break;
            case GetObjectTypes.TEXT:
              resolve((d.Body as any).toString('utf-8'));
              break;
            default:
              resolve(d);
          }
      });
    });
  }

  /**
   * Put an object in a S3 bucket.
   */
  public putObject(options: PutObjectOptions): Promise<AWSS3.PutObjectOutput> {
    return new Promise((resolve, reject) => {
      const params: any = { Bucket: options.bucket, Key: options.key, Body: options.body };
      if (options.contentType) params.ContentType = options.contentType;
      if (options.acl) params.ACL = options.acl;
      if (options.metadata) params.Metadata = options.metadata;
      this.s3.putObject(params, (err: Error, d: AWSS3.PutObjectOutput) => {
        logger('S3 PUT OBJECT', err, options.key);
        if (err) reject(err);
        else resolve(d);
      });
    });
  }

  /**
   * Delete an object from an S3 bucket.
   */
  public deleteObject(options: DeleteObjectOptions): Promise<AWSS3.PutObjectOutput> {
    return new Promise((resolve, reject) => {
      this.s3.deleteObject({ Bucket: options.bucket, Key: options.key }, (err: Error, o: AWSS3.DeleteObjectOutput) => {
        logger('S3 DELETE OBJECT', err, options.key);
        if (err) reject(err);
        else resolve(o);
      });
    });
  }

  /**
   * List the objects of an S3 bucket.
   */
  public listObjects(options: ListObjectsOptions): Promise<AWSS3.ListObjectsOutput> {
    return new Promise((resolve, reject) => {
      this.s3.listObjects(
        { Bucket: options.bucket, Prefix: options.prefix },
        (err: Error, o: AWSS3.ListObjectsOutput) => {
          logger('S3 LIST OBJECTS', err, options.prefix);
          if (err) reject(err);
          else resolve(o);
        }
      );
    });
  }

  /**
   * List the objects keys of an S3 bucket.
   */
  public listObjectsKeys(options: ListObjectsOptions): Promise<string[]> {
    return new Promise((resolve, reject) => {
      this.listObjects(options)
        .then(list => resolve(list.Contents.map(obj => obj.Key)))
        .catch(err => reject(err));
    });
  }

  /**
   * Check whether an object on an S3 bucket exists.
   */
  public doesObjectExist(options: GetObjectOptions): Promise<boolean> {
    return new Promise(resolve => {
      this.s3.headObject({ Bucket: options.bucket, Key: options.key }, (err: Error) => {
        logger('S3 HEAD OBJECT', err, options.key);
        if (err) resolve(false);
        else resolve(true);
      });
    });
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
