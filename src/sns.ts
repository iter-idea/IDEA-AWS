import * as AWSSNS from '@aws-sdk/client-sns';
import { PushNotificationsPlatforms } from 'idea-toolbox';

/**
 * A wrapper for AWS Simple Notification Service.
 */
export class SNS {
  protected client: AWSSNS.SNSClient;

  constructor(options: { region?: string } = {}) {
    this.client = new AWSSNS.SNSClient({ region: options.region });
  }

  /**
   * Create a new endpoint in the SNS platform specified.
   * @return platform endpoint ARN
   */
  async createPlatormEndpoint(
    platform: PushNotificationsPlatforms,
    token: string,
    options: SNSCreateEndpointParams
  ): Promise<string> {
    let platformARN: string;
    switch (platform) {
      case PushNotificationsPlatforms.APNS:
        platformARN = options.appleArn;
        break;
      case PushNotificationsPlatforms.APNS_SANDBOX:
        platformARN = options.appleDevArn;
        break;
      case PushNotificationsPlatforms.FCM:
        platformARN = options.androidArn;
        break;
      default:
        throw new Error('Unsupported platform');
    }

    console.debug('SNS add platform endpoint');
    const command = new AWSSNS.CreatePlatformEndpointCommand({ PlatformApplicationArn: platformARN, Token: token });
    const { EndpointArn } = await this.client.send(command);
    return EndpointArn;
  }

  /**
   * Publish a message to a SNS endpoint.
   */
  async publish(options: SNSPublishParams): Promise<AWSSNS.PublishCommandOutput> {
    let structuredMessage;
    if (options.json) structuredMessage = { default: JSON.stringify(options.json) };
    else
      switch (options.platform) {
        case PushNotificationsPlatforms.APNS:
          structuredMessage = { APNS: JSON.stringify({ aps: { alert: options.message } }) };
          break;
        case PushNotificationsPlatforms.APNS_SANDBOX:
          structuredMessage = { APNS_SANDBOX: JSON.stringify({ aps: { alert: options.message } }) };
          break;
        case PushNotificationsPlatforms.FCM:
          structuredMessage = {
            GCM: JSON.stringify({ notification: { body: options.message, title: options.message } })
          };
          break;
        default:
          throw new Error('Unsupported platform');
      }

    console.debug('SNS publish in topic');
    const command = new AWSSNS.PublishCommand({
      MessageStructure: 'json',
      Message: JSON.stringify(structuredMessage),
      TargetArn: options.endpoint
    });
    return await this.client.send(command);
  }
}

/**
 * Options for creating a SNS endpoint.
 */
export interface SNSCreateEndpointParams {
  /**
   * ARN to production of Apple's (iOS, MacOS) notification services.
   */
  appleArn?: string;
  /**
   * ARN to development of Apple's (iOS, MacOS) notification services.
   */
  appleDevArn?: string;
  /**
   * ARN to Android's notification services.
   */
  androidArn?: string;
}

/**
 * Options to publish a message on a SNS endpoint.
 */
export interface SNSPublishParams {
  /**
   * The endpoint of the notification.
   */
  endpoint: string;
  /**
   * The message to send.
   */
  message?: string;
  /**
   * The platform receiver; used to structure the message.
   */
  platform?: PushNotificationsPlatforms;
  /**
   * If set, message and platform will be ignored and the content of this attribute will be preferred.
   */
  json?: any;
}
