import IdeaX = require('idea-toolbox');
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

  constructor() {
    this.dynamo = new DynamoDB();
    this.s3 = new S3();
  }

  /**
   * Get a signedURL to put an attachment.
   * @param project project code
   * @param teamId the id of the team
   * @return the URL to upload the attachment
   */
  public put(project: string, teamId: string): Promise<IdeaX.SignedURL> {
    return new Promise((resolve, reject) => {
      this.dynamo
        .IUID(project.concat('_').concat(teamId))
        .then(attachmentId => resolve(this.s3.signedURLPut(this.S3_ATTACHMENTS_BUCKET, attachmentId)))
        .catch(err => reject(err));
    });
  }

  /**
   * Get a signedURL to retrieve an attachment.
   * @param attachmentId the id of the attachment to acquire
   * @return the URL to download the attachment
   */
  public get(attachmentId: string): IdeaX.SignedURL {
    return this.s3.signedURLPut(this.S3_ATTACHMENTS_BUCKET, attachmentId);
  }
}
