import { SNS as AWSSNS } from 'aws-sdk';
import { PushNotificationsPlatforms, logger } from 'idea-toolbox';

/**
 * A wrapper for AWS Simple Notification Service.
 */
export class SNS {
  /**
   * Create a new endpoint in the SNS platform specified.
   * @return platform endpoint ARN
   */
  public createPushPlatormEndpoint(
    platform: PushNotificationsPlatforms,
    token: string,
    snsParams: SNSParams
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let platformARN: string;
      // identify the platform ARN
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
          return reject(new Error('UNSUPPORTED_PLATFORM'));
      }
      // create a new endpoint in the platform
      new AWSSNS({ apiVersion: '2010-03-31', region: snsParams.region }).createPlatformEndpoint(
        { PlatformApplicationArn: platformARN, Token: token },
        (err: Error, data: AWS.SNS.CreateEndpointResponse) => {
          logger('SNS ADD PLATFORM ENDPOINT', err);
          if (err || !data.EndpointArn) reject(err);
          else resolve(data.EndpointArn);
        }
      );
    });
  }

  /**
   * Publish a message to a SNS endpoint.
   */
  public publish(params: SNSPublishParams): Promise<AWS.SNS.PublishResponse> {
    return new Promise((resolve, reject) => {
      let structuredMessage;
      if (params.json) structuredMessage = { default: JSON.stringify(params.json) };
      else
        switch (params.platform) {
          case PushNotificationsPlatforms.APNS:
            structuredMessage = { APNS: JSON.stringify({ aps: { alert: params.message } }) };
            break;
          case PushNotificationsPlatforms.APNS_SANDBOX:
            structuredMessage = { APNS_SANDBOX: JSON.stringify({ aps: { alert: params.message } }) };
            break;
          case PushNotificationsPlatforms.FCM:
            structuredMessage = { GCM: JSON.stringify({ notification: { text: params.message } }) };
            break;
          default:
            return reject(new Error('UNSUPPORTED_PLATFORM'));
        }
      new AWSSNS({ apiVersion: '2010-03-31', region: params.region }).publish(
        {
          MessageStructure: 'json',
          Message: JSON.stringify(structuredMessage),
          TargetArn: params.endpoint
        },
        (err: Error, data: AWS.SNS.PublishResponse) => {
          logger('SNS PUBLISH IN TOPIC', err);
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
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
