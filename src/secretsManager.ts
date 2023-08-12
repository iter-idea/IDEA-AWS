import * as AWSSecretsManager from '@aws-sdk/client-secrets-manager';

/**
 * A wrapper for AWS Secrets manager.
 */
export class SecretsManager {
  protected sm: AWSSecretsManager.SecretsManagerClient;

  constructor() {
    this.sm = new AWSSecretsManager.SecretsManagerClient();
  }

  /**
   * Get a secret string from the Secret Manager by its id.
   */
  async getStringById(secretId: string): Promise<string> {
    const command = new AWSSecretsManager.GetSecretValueCommand({ SecretId: secretId });
    const result = await this.sm.send(command);
    return result.SecretString;
  }
}
