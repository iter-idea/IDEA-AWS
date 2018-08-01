import AWS = require('aws-sdk');
import IdeaX = require('idea-toolbox');

/**
 * A wrapper for AWS Simple Notification Service.
 */
export class SNS {
  protected sns: any;

  /**
   * Initialize a new SNS helper object.
   */
  constructor() {
    this.sns = new AWS.SNS({ apiVersion: '2010-03-31', region: process.env['SNS_PUSH_REGION'] });
  }

  /**
   * Create a new endpoint in the SNS platform specified.
   * @param {string} platform enum: APNS, FCM
   * @param {string} deviceId registrationId
   * @param {any} snsParams to identify the SNS resources
   * @return {Promise<string>} platform endpoint ARN
   */
  public createPushPlatormEndpoint(
    platform: string, deviceId: string, snsParams:any
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let platformARN;
      // identify the platform ARN
      switch(platform) {
        case 'APNS': platformARN = snsParams.pushiOS; break;
        case 'FCM': platformARN = snsParams.pushAndroid; break;
        default: return reject(new Error(`UNSUPPORTED_PLATFORM`));
      }
      // create a new endpoint in the platform
      this.sns.createPlatformEndpoint({ PlatformApplicationArn: platformARN, Token: deviceId },
      (err: Error, data: any) => {
        IdeaX.logger('SNS ADD PLATFORM ENDPOINT', err, data);
        if(err || !data.EndpointArn) reject(err);
        else resolve(data.EndpointArn);
      });
    });
  }

  /**
   * Send a push notification through a SNS endpoint.
   * @param {string} message the message to send
   * @param {string} platform enum: APNS, FCM
   * @param {string} endpoint endpoint to a specific device
   * @return {Promise<any>}
   */
  public publishSNSPush(message: string, platform: string, endpoint: string): Promise<any> {
    return new Promise((resolve, reject) => {
      let structuredMessage;
      switch(platform) {
        case 'APNS':
          structuredMessage = { APNS: JSON.stringify({ aps: { alert: message } }) };
        break;
        case 'FCM':
          structuredMessage = { GCM: JSON.stringify({ data: { message: message } }) };
        break;
        default: return reject(new Error(`UNSUPPORTED_PLATFORM`));
      }
      this.sns.publish({
        MessageStructure: 'json', Message: JSON.stringify(structuredMessage), TargetArn: endpoint
      }, (err: Error, data: any) => {
        IdeaX.logger('SNS PUSH NOTIFICATION', err, data);
        if(err) reject(err);
        else resolve(data);
      });
    });
  }
}