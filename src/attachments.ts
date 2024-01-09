import { SignedURL } from 'idea-toolbox';

import { DynamoDB } from './dynamoDB';
import { S3 } from './s3';

/**
 * A custom class that takes advantage of DynamoDB and S3 to easily manage attachments.
 */
export class Attachments {
  /**
   * The bucket where from to retrieve the attachments. Fallback to IDEA's default one.
   */
  protected S3_ATTACHMENTS_BUCKET = process.env.S3_ATTACHMENTS_BUCKET ?? 'idea-attachments';
  /**
   * The prefix for attachment IDs. Fallback to IDEA's default one.
   */
  protected IUID_ATTACHMENTS_PREFIX = process.env.IUID_ATTACHMENTS_PREFIX ?? 'ATT';

  constructor(protected ddb: DynamoDB, protected s3: S3) {}

  /**
   * Get a signedURL to put an attachment.
   */
  async put(project: string, teamId: string): Promise<SignedURL> {
    const attachmentIdPrefix = this.IUID_ATTACHMENTS_PREFIX.concat('_', project, '_', teamId);
    const attachmentId = await this.ddb.IUNID(attachmentIdPrefix);

    const signedURL = await this.s3.signedURLPut(this.S3_ATTACHMENTS_BUCKET, attachmentId);
    signedURL.id = attachmentId;
    return signedURL;
  }

  /**
   * Get a signedURL to retrieve an attachment.
   */
  async get(attachmentId: string): Promise<SignedURL> {
    const signedURL = await this.s3.signedURLGet(this.S3_ATTACHMENTS_BUCKET, attachmentId);
    signedURL.id = attachmentId;
    return signedURL;
  }
}
