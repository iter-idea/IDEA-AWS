import AWS = require('aws-sdk');
import IdeaX = require('idea-toolbox');

/**
 * A wrapper for AWS Simple Notification Service.
 */
export class SNS {
  /**
   * Create a new endpoint in the SNS platform specified.
   * @return platform endpoint ARN
   */
  public createPushPlatormEndpoint(
    platform: IdeaX.PushNotificationsPlatforms,
    token: string,
    snsParams: SNSParams
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let platformARN: string;
      // identify the platform ARN
      switch (platform) {
        case IdeaX.PushNotificationsPlatforms.APNS:
          platformARN = snsParams.appleArn;
          break;
        case IdeaX.PushNotificationsPlatforms.APNS_SANDBOX:
          platformARN = snsParams.appleDevArn;
          break;
        case IdeaX.PushNotificationsPlatforms.FCM:
          platformARN = snsParams.androidArn;
          break;
        default:
          return reject(new Error(`UNSUPPORTED_PLATFORM`));
      }
      // create a new endpoint in the platform
      new AWS.SNS({ apiVersion: '2010-03-31', region: snsParams.region }).createPlatformEndpoint(
        { PlatformApplicationArn: platformARN, Token: token },
        (err: Error, data: AWS.SNS.CreateEndpointResponse) => {
          IdeaX.logger('SNS ADD PLATFORM ENDPOINT', err, JSON.stringify(data));
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
          case IdeaX.PushNotificationsPlatforms.APNS:
            structuredMessage = { APNS: JSON.stringify({ aps: { alert: params.message } }) };
            break;
          case IdeaX.PushNotificationsPlatforms.APNS_SANDBOX:
            structuredMessage = { APNS_SANDBOX: JSON.stringify({ aps: { alert: params.message } }) };
            break;
          case IdeaX.PushNotificationsPlatforms.FCM:
            structuredMessage = { GCM: JSON.stringify({ notification: { text: params.message } }) };
            break;
          default:
            return reject(new Error(`UNSUPPORTED_PLATFORM`));
        }
      new AWS.SNS({ apiVersion: '2010-03-31', region: params.region }).publish(
        {
          MessageStructure: 'json',
          Message: JSON.stringify(structuredMessage),
          TargetArn: params.endpoint
        },
        (err: Error, data: AWS.SNS.PublishResponse) => {
          IdeaX.logger('SNS PUBLISH IN TOPIC', err, JSON.stringify(data));
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
  platform?: IdeaX.PushNotificationsPlatforms;
  /**
   * If set, message and platform will be ignored and the content of this attribute will be preferred.
   */
  json?: object;
}
