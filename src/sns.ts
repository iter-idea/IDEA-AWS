import * as AWSSNS from '@aws-sdk/client-sns';
import { PushNotificationsPlatforms } from 'idea-toolbox';

import { Logger } from './logger';

/**
 * A wrapper for AWS Simple Notification Service.
 */
export class SNS {
  logger = new Logger();

  constructor(params?: { debug?: boolean }) {
    const options = Object.assign({}, params, { debug: true });
    this.logger.level = options.debug ? 'DEBUG' : 'INFO';
  }

  /**
   * Create a new endpoint in the SNS platform specified.
   * @return platform endpoint ARN
   */
  async createPushPlatormEndpoint(
    platform: PushNotificationsPlatforms,
    token: string,
    snsParams: SNSParams
  ): Promise<string> {
    let platformARN: string;
    switch (platform) {
      case PushNotificationsPlatforms.APNS:
        platformARN = snsParams.appleArn;
        break;
      case PushNotificationsPlatforms.APNS_SANDBOX:
        platformARN = snsParams.appleDevArn;
        break;
      case PushNotificationsPlatforms.FCM:
        platformARN = snsParams.androidArn;
        break;
      default:
        throw new Error('Unsupported platform');
    }

    this.logger.debug('SNS ADD PLATFORM ENDPOINT');
    const client = new AWSSNS.SNSClient({ region: snsParams.region });
    const command = new AWSSNS.CreatePlatformEndpointCommand({ PlatformApplicationArn: platformARN, Token: token });
    const { EndpointArn } = await client.send(command);

    return EndpointArn;
  }

  /**
   * Publish a message to a SNS endpoint.
   */
  async publish(snsParams: SNSPublishParams): Promise<AWSSNS.PublishCommandOutput> {
    let structuredMessage;
    if (snsParams.json) structuredMessage = { default: JSON.stringify(snsParams.json) };
    else
      switch (snsParams.platform) {
        case PushNotificationsPlatforms.APNS:
          structuredMessage = { APNS: JSON.stringify({ aps: { alert: snsParams.message } }) };
          break;
        case PushNotificationsPlatforms.APNS_SANDBOX:
          structuredMessage = { APNS_SANDBOX: JSON.stringify({ aps: { alert: snsParams.message } }) };
          break;
        case PushNotificationsPlatforms.FCM:
          structuredMessage = {
            GCM: JSON.stringify({ notification: { body: snsParams.message, title: snsParams.message } })
          };
          break;
        default:
          throw new Error('Unsupported platform');
      }

    this.logger.debug('SNS PUBLISH IN TOPIC');
    const client = new AWSSNS.SNSClient({ region: snsParams.region });
    const command = new AWSSNS.PublishCommand({
      MessageStructure: 'json',
      Message: JSON.stringify(structuredMessage),
      TargetArn: snsParams.endpoint
    });
    return await client.send(command);
  }
}

/**
 * SNS configuration.
 */
export interface SNSParams {
  /**
   * SNS region.
   */
  region: string;
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

export interface SNSPublishParams {
  /**
   * SNS region.
   */
  region: string;
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
