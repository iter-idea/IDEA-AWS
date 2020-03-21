import AWS = require('aws-sdk');
import IdeaX = require('idea-toolbox');

/**
 * A wrapper for AWS Simple Notification Service.
 */
export class SNS {
  protected sns: AWS.SNS;

  protected IDEA_DEFAULT_SNS_ENDPOINT = 'arn:aws:sns:eu-west-2:854501414358:idea_notifications';

  /**
   * Initialize a new SNS helper object.
   */
  constructor() {
    this.sns = new AWS.SNS({ apiVersion: '2010-03-31', region: process.env['SNS_PUSH_REGION'] });
  }

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
      this.sns.createPlatformEndpoint(
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
   * Send a push notification through a SNS endpoint.
   * @param endpoint endpoint to a specific device (default: IDEA's endpoint)
   */
  public publishSNSPush(
    message: string,
    platform: IdeaX.PushNotificationsPlatforms,
    endpoint?: string
  ): Promise<AWS.SNS.PublishResponse> {
    return new Promise((resolve, reject) => {
      endpoint = endpoint || this.IDEA_DEFAULT_SNS_ENDPOINT;
      let structuredMessage;
      switch (platform) {
        case IdeaX.PushNotificationsPlatforms.APNS:
          structuredMessage = { APNS: JSON.stringify({ aps: { alert: message } }) };
          break;
        case IdeaX.PushNotificationsPlatforms.APNS_SANDBOX:
          structuredMessage = { APNS_SANDBOX: JSON.stringify({ aps: { alert: message } }) };
          break;
        case IdeaX.PushNotificationsPlatforms.FCM:
          structuredMessage = { GCM: JSON.stringify({ notification: { text: message } }) };
          break;
        default:
          return reject(new Error(`UNSUPPORTED_PLATFORM`));
      }
      this.sns.publish(
        {
          MessageStructure: 'json',
          Message: JSON.stringify(structuredMessage),
          TargetArn: endpoint
        },
        (err: Error, data: AWS.SNS.PublishResponse) => {
          IdeaX.logger('SNS PUSH NOTIFICATION', err, JSON.stringify(data));
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
  }

  /**
   * Publish a JSON message (object) in a SNS endpoint.
   * @param endpoint SNS endpoint (default: IDEA's endpoint)
   */
  public publishJSON(object: object, endpoint?: string): Promise<AWS.SNS.PublishResponse> {
    return new Promise((resolve, reject) => {
      endpoint = endpoint || this.IDEA_DEFAULT_SNS_ENDPOINT;
      this.sns.publish(
        { MessageStructure: 'json', Message: JSON.stringify({ default: JSON.stringify(object) }), TargetArn: endpoint },
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
   * SES region.
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
