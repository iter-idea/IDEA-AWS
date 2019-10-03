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
   * @param platform enum: APNS, FCM
   * @param deviceId registrationId
   * @param snsParams to identify the SNS resources
   * @return platform endpoint ARN
   */
  public createPushPlatormEndpoint(platform: string, deviceId: string, snsParams: any): Promise<string> {
    return new Promise((resolve, reject) => {
      let platformARN;
      // identify the platform ARN
      switch (platform) {
        case 'APNS':
          platformARN = snsParams.pushiOS;
          break;
        case 'FCM':
          platformARN = snsParams.pushAndroid;
          break;
        default:
          return reject(new Error(`UNSUPPORTED_PLATFORM`));
      }
      // create a new endpoint in the platform
      this.sns.createPlatformEndpoint(
        { PlatformApplicationArn: platformARN, Token: deviceId },
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
   * @param message the message to send
   * @param platform enum: APNS, FCM
   * @param endpoint endpoint to a specific device
   */
  public publishSNSPush(message: string, platform: string, endpoint: string): Promise<AWS.SNS.PublishResponse> {
    return new Promise((resolve, reject) => {
      let structuredMessage;
      switch (platform) {
        case 'APNS':
          structuredMessage = { APNS: JSON.stringify({ aps: { alert: message } }) };
          break;
        case 'FCM':
          structuredMessage = { GCM: JSON.stringify({ data: { message } }) };
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
   * @param object the JSON object to send
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
