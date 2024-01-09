import * as AWSSystemsManager from '@aws-sdk/client-ssm';

/**
 * A wrapper for AWS Systems Manager (SSM).
 */
export class SystemsManager {
  protected ssm: AWSSystemsManager.SSMClient;
  protected cache = new Map<string, string>();

  constructor() {
    this.ssm = new AWSSystemsManager.SSMClient();
  }

  /**
   * Get a parameter by its name (path).
   */
  async getParameterByName(
    name: string,
    options: { noCache?: boolean; withDecryption?: boolean } = {}
  ): Promise<string> {
    if (!options.noCache && this.cache.has(name)) return this.cache.get(name);
    const command = new AWSSystemsManager.GetParameterCommand({ Name: name, WithDecryption: options.withDecryption });
    const { Parameter } = await this.ssm.send(command);
    this.cache.set(name, Parameter.Value);
    return Parameter.Value;
  }
  /**
   * Get a parameter (with decryption) by its name (path).
   */
  async getSecretByName(name: string, options: { noCache?: boolean } = {}): Promise<string> {
    return this.getParameterByName(name, { ...options, withDecryption: true });
  }
}
