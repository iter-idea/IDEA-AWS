import AWS = require('aws-sdk');
import Nodemailer = require('nodemailer');
import IdeaX = require('idea-toolbox');

/**
 * A wrapper for AWS Simple Email Service.
 */
export class SES {
  /**
   * Initialize a new SES helper object.
   */
  constructor() {}

  /**
   * Send an email through AWS Simple Email Service.
   * @param {any} emailData structured as follows:
   ```
    toAddresses: Array<string>;
    ccAddresses?: Array<string>;
    bccAddresses?: Array<string>;
    replyToAddresses: Array<string>;
    subject: string;
    html?: string;
    text?: string;
    attachments?: Array<any>; // https://community.nodemailer.com/using-attachments/
   ```
   * @param {any} sesParams structured as follows
   ```
    region: string;
    source: string;
    sourceArn: string;
   ```
   * @return {Promise<any>}
   */
  public sendEmail(emailData: any, sesParams: any): Promise<any> {
    // if the email includes attachments, send through Nodemailer
    if (emailData.attachments && emailData.attachments.length) return this.sendEmailNodemailer(emailData, sesParams);
    // otherwise via SES (more secure)
    else return this.sendEmailSES(emailData, sesParams);
  }
  /**
   * @private helper
   */
  private sendEmailSES(emailData: any, sesParams: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // prepare SES email data
      const sesData: any = {};
      sesData.Destination = {};
      if (emailData.toAddresses) sesData.Destination.ToAddresses = emailData.toAddresses;
      if (emailData.ccAddresses) sesData.Destination.CcAddresses = emailData.ccAddresses;
      if (emailData.bccAddresses) sesData.Destination.BccAddresses = emailData.bccAddresses;
      sesData.Message = {};
      if (emailData.subject) sesData.Message.Subject = { Charset: 'UTF-8', Data: emailData.subject };
      sesData.Message.Body = {};
      if (emailData.html) sesData.Message.Body.Html = { Charset: 'UTF-8', Data: emailData.html };
      if (emailData.text) sesData.Message.Body.Text = { Charset: 'UTF-8', Data: emailData.text };
      if (!emailData.html && !emailData.text) sesData.Message.Body.Text = { Charset: 'UTF-8', Data: '' };
      sesData.ReplyToAddresses = emailData.replyToAddresses;
      sesData.Source = `${sesParams.sourceName} <${sesParams.source}>`;
      sesData.SourceArn = sesParams.sourceArn;
      IdeaX.logger('SES DATA PREPARATION', null, sesData);
      // send email
      new AWS.SES({ region: sesParams.region }).sendEmail(sesData, (err: Error, data: any) => {
        IdeaX.logger('SES SEND EMAIL', err, JSON.stringify(data));
        if (err) reject(err);
        else resolve(data);
      });
    });
  }
  /**
   * @private helper
   */
  private sendEmailNodemailer(emailData: any, sesParams: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // set the mail options in Nodemailer's format
      const mailOptions: any = {};
      mailOptions.from = `${sesParams.sourceName} <${sesParams.source}>`;
      mailOptions.to = emailData.toAddresses.join(',');
      if (emailData.ccAddresses) mailOptions.cc = emailData.ccAddresses.join(',');
      if (emailData.bccAddresses) mailOptions.bcc = emailData.bccAddresses.join(',');
      if (emailData.replyToAddresses) mailOptions.replyTo = emailData.replyToAddresses.join(',');
      mailOptions.subject = emailData.subject;
      if (emailData.html) mailOptions.html = emailData.html;
      if (emailData.text) mailOptions.text = emailData.text;
      mailOptions.attachments = emailData.attachments;
      IdeaX.logger('NODEMAILER OPTION PREPARATION', null, mailOptions);
      // create Nodemailer SES transporter and send the email
      Nodemailer.createTransport({ SES: new AWS.SES({ region: sesParams.region }) }).sendMail(
        mailOptions,
        (err: Error, data: any) => {
          IdeaX.logger('SES SEND EMAIL (NODEMAILER)', err, data);
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
  }
}
