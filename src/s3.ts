import AWS = require('aws-sdk');
import IdeaX = require('idea-toolbox');

/**
 * A wrapper for AWS Simple Storage Service.
 */
export class S3 {
  protected s3: AWS.S3;

  protected DEFAULT_DOWNLOAD_BUCKET_PREFIX = 'common';
  protected DEFAULT_DOWNLOAD_BUCKET = 'idea-downloads';
  protected DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP = 180;
  protected DEFAULT_UPLOAD_BUCKET_SEC_TO_EXP = 300;

  /**
   * Initialize a new S3 helper object.
   */
  constructor() {
    this.s3 = new AWS.S3({ apiVersion: '2006-03-01', signatureVersion: 'v4' });
  }

  /**
   * Create a download link of a piece of data (through S3).
   * *Pratically*, it uploads the file on an S3 bucket, generating and returning a url to it.
   * @param data usually a buffer
   * @param options strucuted as follows
   * ```
   * bucket?: string;       // downloads bucket; default: `idea-downloads`.
   * prefix?: string;       // folder (e.g. the project name); default: `common`.
   * key?; string;          // the unique filepath in which to store the file; default: _random_.
   * contentType?: string;  // e.g. application/json; default: _guessed_.
   * secToExp?: number;     // seconds to URL expiration; default: `180`.
   * ```
   */
  public createDownloadURLFromData(data: any, options?: any): Promise<SignedURL> {
    return new Promise((resolve, reject) => {
      // if needed, randomly generates the key
      if (!options.key)
        options.key = new Date()
          .getTime()
          .toString()
          .concat(
            Math.random()
              .toString(36)
              .slice(2)
          );
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
        (err: Error, d: any) => {
          IdeaX.logger('S3 UPLOAD', err, d);
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
    return {
      url: this.s3.getSignedUrl('putObject', {
        Bucket: bucket,
        Key: key,
        Expires: expires || this.DEFAULT_UPLOAD_BUCKET_SEC_TO_EXP
      })
    };
  }

  /**
   * Get a signed URL to get a file on a S3 bucket.
   * @param expires seconds after which the signed URL expires
   */
  public signedURLGet(bucket: string, key: string, expires?: number): SignedURL {
    return {
      url: this.s3.getSignedUrl('getObject', {
        Bucket: bucket,
        Key: key,
        Expires: expires || this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP
      })
    };
  }

  /**
   * Make a copy of an object of the bucket.
   * @param options strucuted as follows
   * ```
   * copySource: string;   // the source path (complete with the bucket name).
   * bucket: string;       // the bucket in which to copy the file.
   * key; string;          // the complete filepath of the bucket in which to copy the file
   * ```
   */
  public copyObject(options?: any): Promise<void> {
    return new Promise((resolve, reject) => {
      this.s3.copyObject(
        { CopySource: options.copySource, Bucket: options.bucket, Key: options.key },
        (err: Error, d: any) => {
          IdeaX.logger('S3 COPY OBJECT', err, d);
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  /**
   * Get an object from a S3 bucket.
   * @param options strucuted as follows
   * ```
   * bucket: string;       // the bucket in which to copy the file.
   * key; string;          // the complete filepath of the bucket in which to copy the file
   * type: string;         // enum: JSON; useful to cast the result
   * ```
   */
  public getObject(options?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      this.s3.getObject({ Bucket: options.bucket, Key: options.key }, (err: Error, d: any) => {
        IdeaX.logger('S3 GET OBJECT', err, d);
        if (err) reject(err);
        else
          switch (options.type) {
            case 'JSON':
              resolve(JSON.parse(d.Body.toString('utf-8')));
              break;
            default:
              resolve(d);
          }
      });
    });
  }

  /**
   * Put an object in a S3 bucket.
   * @param options strucuted as follows
   * ```
   * bucket: string;         // the bucket in which to copy the file.
   * key; string;            // the complete filepath of the bucket in which to copy the file
   * body: any;              // the content of the file
   * contentType?: string;   // content type (e.g. image/png)
   * acl?: string;           // access-control list (e.g. public-read)
   * metadata?: any;         // a set of metadata as attributes
   * ```
   */
  public putObject(options?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const params: any = { Bucket: options.bucket, Key: options.key, Body: options.body };
      if (options.contentType) params.ContentType = options.contentType;
      if (options.acl) params.ACL = options.acl;
      if (options.metadata) params.Metadata = options.metadata;
      this.s3.putObject(params, (err: Error, d: any) => {
        IdeaX.logger('S3 PUT OBJECT', err, d);
        if (err) reject(err);
        else resolve(d);
      });
    });
  }
}

/**
 * To return the URL as a JSON.
 */
export interface SignedURL {
  url: string;
}
