import { SignedURL } from 'idea-toolbox';

import { DynamoDB } from './dynamoDB';
import { S3, SignedURLOptions } from './s3';
import { HandledError } from './genericController';

/**
 * A custom class that takes advantage of DynamoDB and S3 to easily manage attachments.
 */
export class Attachments {
  /**
   * The bucket where from to retrieve the attachments. Fallback to IDEA's default one (CDK).
   */
  bucket = process.env.S3_BUCKET_MEDIA;
  /**
   * The folder where from to retrieve the attachments. Fallback to IDEA's default one (CDK).
   */
  folder = process.env.S3_ATTACHMENTS_FOLDER;
  /**
   * The default prefix for attachment IDs.
   */
  prefix = process.env.PROJECT ? process.env.PROJECT.concat('_ATT') : 'ATT';

  constructor(protected ddb: DynamoDB, protected s3: S3, options: AttachmentsInitOptions = {}) {
    if (options.compatibility === 'v1') {
      this.bucket = process.env.S3_ATTACHMENTS_BUCKET || 'idea-attachments';
      this.folder = null;
      this.prefix = 'ATT';
    }
  }

  /**
   * Get a `SignedURL` to upload an attachment.
   */
  async put(options: AttachmentsOptions = {}): Promise<SignedURL> {
    const attachmentId = await this.ddb.IUNID(options.prefix || this.prefix);
    const key = this.folder ? `${this.folder}/${attachmentId}` : attachmentId;
    const signedURL = await this.s3.signedURLPut(this.bucket, key);
    signedURL.id = attachmentId;
    return signedURL;
  }

  /**
   * Get a `SignedURL` to download an attachment.
   */
  async get(attachmentId: string, options: AttachmentsOptions = {}): Promise<SignedURL> {
    if (!attachmentId) throw new HandledError('Missing attachment ID');
    if (!attachmentId.startsWith(options.prefix || this.prefix)) throw new HandledError('Not found');
    const key = this.folder ? `${this.folder}/${attachmentId}` : attachmentId;
    const signedURL = await this.s3.signedURLGet(this.bucket, key);
    signedURL.id = attachmentId;
    return signedURL;
  }
}

/**
 * Options when creating a new instance of Attachments.
 */
export interface AttachmentsInitOptions {
  /**
   * Whether to enable the compatibility mode to older versions (temporary, it will be removed).
   */
  compatibility?: 'v1';
}

/**
 * Options when preparing for the upload/download of an attachment.
 */
export interface AttachmentsOptions extends SignedURLOptions {
  /**
   * The attachment ID prefix, if different from the internal attribute `prefix`.
   */
  prefix?: string;
}
