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
    return new Promise((resolve, reject) => {
      // prepare SES email data
      let sesData: any = {};
      sesData.Destination = {};
      if(emailData.toAddresses) sesData.Destination.ToAddresses = emailData.toAddresses;
      if(emailData.ccAddresses) sesData.Destination.CcAddresses = emailData.ccAddresses;
      if(emailData.bccAddresses) sesData.Destination.BccAddresses = emailData.bccAddresses;
      sesData.Message = {};
      if(emailData.subject) sesData.Message.Subject = { Charset: 'UTF-8', Data: emailData.subject };
      sesData.Message.Body = {};
      if(emailData.html) sesData.Message.Body.Html = { Charset: 'UTF-8', Data: emailData.html };
      if(emailData.text) sesData.Message.Body.Text = { Charset: 'UTF-8', Data: emailData.text };
      if(!emailData.html && !emailData.text)
        sesData.Message.Body.Text = { Charset: 'UTF-8', Data: '' };
      sesData.ReplyToAddresses = emailData.replyToAddresses;
      sesData.Source = `${sesParams.sourceName} <${sesParams.source}>`;
      sesData.SourceArn = sesParams.sourceArn;
      let ses = new AWS.SES({ region: sesParams.region });
      // send email
      if(emailData.attachments && emailData.attachments.length) {
        // including attachments, through Nodemailer
        this.sendEmailNodemailer(ses, sesData, emailData.attachments)
        .then(res => resolve(res))
        .catch(err => reject(err));
      } else {
        // classic way, through SES
        ses.sendEmail(sesData, (err: Error, data: any) => {
          IdeaX.logger('SES SEND EMAIL', err, JSON.stringify(data));
          if(err) reject(err);
          else resolve(data);
        });
      }
    });
  }

  /**
   * @private helper
   */
  private sendEmailNodemailer(ses: any, sesData: any, attachments: Array<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      // set the mail options in Nodemailer's format
      let mailOptions: any = {};
      mailOptions.from = sesData.Source;
      mailOptions.to = sesData.Destination.ToAddresses.join(',');
      if(sesData.Destination.cc) mailOptions.cc = sesData.Destination.CcAddresses.join(',');
      if(sesData.Destination.bcc) mailOptions.bcc = sesData.Destination.BccAddresses.join(',');
      if(sesData.ReplyToAddresses) mailOptions.replyTo = sesData.ReplyToAddresses.join(',');
      mailOptions.subject = sesData.Message.Subject.Data;
      if(sesData.Message.Body.Html) mailOptions.html = sesData.Message.Body.Html.Data;
      if(sesData.Message.Body.Text) mailOptions.text = sesData.Message.Body.Text.Data;
      mailOptions.attachments = attachments;
      // create Nodemailer SES transporter
      let transporter = Nodemailer.createTransport({ SES: ses });
      // send the email
      transporter.sendMail(mailOptions, (err: Error, data: any) => {
        IdeaX.logger('SES SEND EMAIL (NODEMAILER)', err, data);
        if(err) reject(err);
        else resolve(data);
      });
    });
  }
}