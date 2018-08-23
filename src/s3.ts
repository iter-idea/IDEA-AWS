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
   * Create a download link of a piece of data (through S3).
   * *Pratically*, it uploads the file on an S3 bucket, generating and returning a url to it.
   * @param {string} prefix the bucket folder (e.g. the project name)
   * @param {string} key the unique filepath in which to store the file
   * @param {any} data usually a buffer
   * @param {string} contentType e.g. application/json
   * @param {number} secToExp seconds to url expiration
   * @param {string} bucket an alternative Downloads bucket to IDEA's default one
   * @return {Promise<string>}
   */
  public createDownloadUrlFromData(
    prefix: string, key: string, data: any, contentType?: string, secToExp?: number, bucket?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      key = `${prefix || this.DEFAULT_DOWNLOAD_BUCKET_PREFIX}/${key}`;
      bucket = bucket || this.DEFAULT_DOWNLOAD_BUCKET;
      secToExp = secToExp || this.DEFAULT_DOWNLOAD_BUCKET_SEC_TO_EXP;
      this.s3.upload({ Bucket: bucket, Key: key, Body: data, ContentType: contentType },
      (err: Error, data: any) => {
        IdeaX.logger('S3 UPLOAD', err, data);
        if(err) reject(err);
        else resolve(this.s3.getSignedUrl('getObject', {
          Bucket: bucket, Key: key, Expires: secToExp
        }));
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