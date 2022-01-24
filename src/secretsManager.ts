import { SecretsManager as AWSSecretsManager } from 'aws-sdk';

/**
 * A wrapper for AWS Secrets manager.
 */
export class SecretsManager {
  protected sm: AWSSecretsManager;

  constructor() {
    this.sm = new AWSSecretsManager();
  }

  /**
   * Get a secret string from the Secret Manager by its id.
   */
  async getStringById(secretId: string): Promise<string> {
    const result = await this.sm.getSecretValue({ SecretId: secretId }).promise();
    return result.SecretString;
  }
}
