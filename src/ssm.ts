import * as AWSSystemsManager from '@aws-sdk/client-ssm';

/**
 * A wrapper for AWS Systems Manager (SSM).
 */
export class SystemsManager {
  protected ssm: AWSSystemsManager.SSMClient;

  constructor() {
    this.ssm = new AWSSystemsManager.SSMClient();
  }

  /**
   * Get a parameter by its name (path).
   */
  async getParameterByName(name: string): Promise<string> {
    const command = new AWSSystemsManager.GetParameterCommand({ Name: name });
    const result = await this.ssm.send(command);
    return result.Parameter.Value;
  }
  /**
   * Get a parameter (with decryption) by its name (path).
   */
  async getSecretByName(name: string): Promise<string> {
    const command = new AWSSystemsManager.GetParameterCommand({ Name: name, WithDecryption: true });
    const result = await this.ssm.send(command);
    return result.Parameter.Value;
  }
}
