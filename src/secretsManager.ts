import * as AWSSecretsManager from '@aws-sdk/client-secrets-manager';

/**
 * A wrapper for AWS Secrets manager.
 */
export class SecretsManager {
  protected sm: AWSSecretsManager.SecretsManagerClient;
  protected cache = new Map<string, string>();

  constructor() {
    this.sm = new AWSSecretsManager.SecretsManagerClient();
  }

  /**
   * Get a secret string from the Secret Manager by its id.
   */
  async getStringById(secretId: string, options: { noCache?: boolean } = {}): Promise<string> {
    if (!options.noCache && this.cache.has(secretId)) return this.cache.get(secretId);
    const command = new AWSSecretsManager.GetSecretValueCommand({ SecretId: secretId });
    const { SecretString } = await this.sm.send(command);
    this.cache.set(secretId, SecretString);
    return SecretString;
  }
}
