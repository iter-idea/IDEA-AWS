import { SignedURL } from 'idea-toolbox';
import { DynamoDB } from './dynamoDB';
import { S3 } from './s3';

// declare libs as global vars to be reused in warm starts by the Lambda function
let ideaWarmStart_ddb: DynamoDB = null;
let ideaWarmStart_s3: S3 = null;

/**
 * A custom class that takes advantage of DynamoDB and S3 to easily manage attachments.
 */
export class Attachments {
  /**
   * The instance of DynamoDB.
   */
  protected dynamo: DynamoDB;
  /**
   * The instance of S3.
   */
  protected s3: S3;
  /**
   * The bucket where from to retrieve the attachments. Fallback to IDEA's default one.
   */
  protected S3_ATTACHMENTS_BUCKET = process.env['S3_ATTACHMENTS_BUCKET'] || 'idea-attachments';
  protected IUID_ATTACHMENTS_PREFIX = process.env['IUID_ATTACHMENTS_PREFIX'] || 'ATT';

  constructor() {
    if (!ideaWarmStart_ddb) ideaWarmStart_ddb = new DynamoDB();
    this.dynamo = ideaWarmStart_ddb;

    if (!ideaWarmStart_s3) ideaWarmStart_s3 = new S3();
    this.s3 = ideaWarmStart_s3;
  }

  /**
   * Get a signedURL to put an attachment.
   */
  async put(project: string, teamId: string): Promise<SignedURL> {
    const attachmentIdPrefix = this.IUID_ATTACHMENTS_PREFIX.concat('_').concat(project).concat('_').concat(teamId);
    const attachmentId = await this.dynamo.IUNID(attachmentIdPrefix);

    const signedURL = this.s3.signedURLPut(this.S3_ATTACHMENTS_BUCKET, attachmentId);
    signedURL.id = attachmentId;
    return signedURL;
  }

  /**
   * Get a signedURL to retrieve an attachment.
   */
  get(attachmentId: string): SignedURL {
    const signedURL = this.s3.signedURLGet(this.S3_ATTACHMENTS_BUCKET, attachmentId);
    signedURL.id = attachmentId;
    return signedURL;
  }
}
