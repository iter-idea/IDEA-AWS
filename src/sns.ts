import { SNS as AWSSNS } from 'aws-sdk';
import { PushNotificationsPlatforms, logger } from 'idea-toolbox';

// declare libs as global vars to be reused in warm starts by the Lambda function
let ideaWarmStart_sns: AWSSNS = null;

/**
 * A wrapper for AWS Simple Notification Service.
 */
export class SNS {
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

    logger('SNS ADD PLATFORM ENDPOINT');
    if (!ideaWarmStart_sns) ideaWarmStart_sns = new AWSSNS({ apiVersion: '2010-03-31', region: snsParams.region });
    const result = await ideaWarmStart_sns
      .createPlatformEndpoint({ PlatformApplicationArn: platformARN, Token: token })
      .promise();

    return result.EndpointArn;
  }

  /**
   * Publish a message to a SNS endpoint.
   */
  async publish(snsParams: SNSPublishParams): Promise<AWS.SNS.PublishResponse> {
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

    logger('SNS PUBLISH IN TOPIC');
    if (!ideaWarmStart_sns) ideaWarmStart_sns = new AWSSNS({ apiVersion: '2010-03-31', region: snsParams.region });
    return await ideaWarmStart_sns
      .publish({ MessageStructure: 'json', Message: JSON.stringify(structuredMessage), TargetArn: snsParams.endpoint })
      .promise();
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
