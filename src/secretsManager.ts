import { SecretsManager as AWSSecretsManager } from 'aws-sdk';
import { logger } from 'idea-toolbox';

// declare libs as global vars to be reused in warm starts by the Lambda function
let ideaWarmStart_secretsManager: AWSSecretsManager = null;

/**
 * A wrapper for AWS Secrets manager.
 */
export class SecretsManager {
  protected sm: AWSSecretsManager;

  constructor() {
    if (!ideaWarmStart_secretsManager) ideaWarmStart_secretsManager = new AWSSecretsManager();
    this.sm = ideaWarmStart_secretsManager;
  }

  /**
   * Get a secret string from the Secret Manager by its id.
   */
  async getStringById(secretId: string): Promise<string> {
    try {
      const result = await this.sm.getSecretValue({ SecretId: secretId }).promise();
      return result.SecretString;
    } catch (err) {
      logger('SECRET NOT FOUND', err, secretId);
      throw new Error('Not found');
    }
  }
}
