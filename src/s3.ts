import AWS = require('aws-sdk');
import IdeaX = require('idea-toolbox');

/**
 * A wrapper for AWS Simple Storage Service.
 */
export class S3 {
  protected s3: any;

  protected DEFAULT_DOWNLOAD_BUCKET: string = 'idea-downloads';
  protected DEFAULT_DOWNLOAD_BUCKET_PREFIX: string = 'common';
  protected DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP: number = 180;
  protected DEFAULT_UPLOAD_BUCKET_SEC_TO_EXP: number = 300;

  /**
   * Initialize a new S3 helper object.
   */
  constructor() {
    this.s3 = new AWS.S3({ apiVersion: '2006-03-01', signatureVersion: 'v4' });
  }

  /**
   * Download a file through an S3 signed url.
   * *Pratically*, it uploads the file on an S3 bucket (w/ automatic cleaning),
   * it generates a signed url, returning it.
   * @param {string} prefix a folder in which to put all the files of the same kind
   * @param {string} key the unique filepath
   * @param {any} dataToUpload usually a buffer
   * @param {string} contentType e.g. application/json
   * @param {string} bucket an alternative Downloads bucket to the default one
   * @param {number} secToExp seconds to url expiration
   * @return {Promise<string>}
   */
  public downloadThroughUrl(
    prefix: string, key: string, dataToUpload: any, contentType: string,
    bucket?: string, secToExp?: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      key = `${prefix || this.DEFAULT_DOWNLOAD_BUCKET_PREFIX}/${key}`;
      bucket = bucket || this.DEFAULT_DOWNLOAD_BUCKET;
      secToExp = secToExp || this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP;
      this.s3.upload({ Bucket: bucket, Key: key, Body: dataToUpload, ContentType: contentType },
      (err: Error, data: any) => {
        IdeaX.logger('S3 UPLOAD', err, data);
        if(err) reject(err);
        else resolve(this.s3.getSignedUrl('getObject', { Bucket: bucket, Key: key, Expires: secToExp }));
      });
    });
  }

  /**
   * Get a signed URL to put a file on a S3 bucket.
   * @param {string} bucket
   * @param {string} key
   * @param {number} expires seconds after which the signed URL expires
   */
  public signedUrlPut(bucket: string, key: string, expires?: number): string {
    return this.s3.getSignedUrl('putObject', {
      Bucket: bucket, Key: key, Expires: expires || this.DEFAULT_UPLOAD_BUCKET_SEC_TO_EXP
    });
  }

  /**
   * Get a signed URL to get a file on a S3 bucket.
   * @param {string} bucket
   * @param {string} key
   * @param {number} expires seconds after which the signed URL expires
   */
  public signedUrlGet(bucket: string, key: string, expires?: number): string {
    return this.s3.getSignedUrl('getObject', {
      Bucket: bucket, Key: key, Expires: expires || this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP
    });
  }
}