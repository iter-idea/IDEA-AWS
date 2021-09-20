import { SignedURL } from 'idea-toolbox';
import { DynamoDB } from './dynamoDB';
import { S3 } from './s3';

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
    this.dynamo = new DynamoDB();
    this.s3 = new S3();
  }

  /**
   * Get a signedURL to put an attachment.
   */
  put(project: string, teamId: string): Promise<SignedURL> {
    return new Promise((resolve, reject) => {
      this.dynamo
        .IUID(this.IUID_ATTACHMENTS_PREFIX.concat('_').concat(project).concat('_').concat(teamId))
        .then(attachmentId => {
          const signedURL = this.s3.signedURLPut(this.S3_ATTACHMENTS_BUCKET, attachmentId);
          signedURL.id = attachmentId;
          resolve(signedURL);
        })
        .catch(err => reject(err));
    });
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
