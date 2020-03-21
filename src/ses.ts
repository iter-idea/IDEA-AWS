import AWS = require('aws-sdk');
import Nodemailer = require('nodemailer');
import IdeaX = require('idea-toolbox');

/**
 * A wrapper for AWS Simple Email Service.
 */
export class SES {
  /**
   * Send an email through AWS Simple Email Service.
   */
  public sendEmail(emailData: EmailData, sesParams: SESParams): Promise<void> {
    // if the email includes attachments, send through Nodemailer
    if (emailData.attachments && emailData.attachments.length) return this.sendEmailNodemailer(emailData, sesParams);
    // otherwise via SES (more secure)
    else return this.sendEmailSES(emailData, sesParams);
  }
  private sendEmailSES(emailData: EmailData, sesParams: SESParams): Promise<void> {
    return new Promise((resolve, reject) => {
      // prepare SES email data
      const sesData: AWS.SES.SendEmailRequest | any = {};
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
      new AWS.SES({ region: sesParams.region }).sendEmail(sesData, (err: Error, data: AWS.SES.SendEmailResponse) => {
        IdeaX.logger('SES SEND EMAIL', err, JSON.stringify(data));
        if (err) reject(err);
        else resolve();
      });
    });
  }
  private sendEmailNodemailer(emailData: EmailData, sesParams: SESParams): Promise<void> {
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
          else resolve();
        }
      );
    });
  }
}

/**
 * The data to send an email.
 */
export interface EmailData {
  /**
   * Array of TO email addresses.
   */
  toAddresses: Array<string>;
  /**
   * Array of CC email addresses.
   */
  ccAddresses?: Array<string>;
  /**
   * Array of BCC email addresses.
   */
  bccAddresses?: Array<string>;
  /**
   * Array of Reply-To email addresses.
   */
  replyToAddresses: Array<string>;
  /**
   * Subject of the email.
   */
  subject: string;
  /**
   * HTML content of the email.
   */
  html?: string;
  /**
   * Text content of the email
   */
  text?: string;
  /**
   * The array of attachments. Ref. https://community.nodemailer.com/using-attachments/
   */
  attachments?: Array<EmailAttachment>;
}

/**
 * Email attachment interface of Nodemailer.
 */
interface EmailAttachment {
  /**
   * String, Buffer or a Stream contents for the attachmentent
   */
  content?: string | Buffer;
  /**
   * Path to a file or an URL (data uris are allowed as well) if you want to stream the file instead of including it
   * (better for larger attachments).
   */
  path?: string;
  /**
   * Filename to be reported as the name of the attached file, use of unicode is allowed.
   * If you do not want to use a filename, set this value as false, otherwise a filename is generated automatically .
   * */
  filename?: string | false;
  /**
   * If set and content is string, then encodes the content to a Buffer using the specified encoding.
   * Example values: base64, hex, binary etc. Useful if you want to use binary attachments in a JSON formatted e-mail.
   */
  encoding?: string;
  /**
   * Optional content type for the attachment, if not set will be derived from the filename property
   * */
  contentType?: string;
  /**
   * Additional headers
   */
  headers?: Headers;
  /**
   * Optional value that overrides entire node content in the mime message.
   * If used then all other options set for this node are ignored.
   */
  raw?: string | Buffer;
}

/**
 * SES configuration.
 */
export interface SESParams {
  /**
   * The name of the source (e.g. Matteo Carbone).
   */
  sourceName: string;
  /**
   * The email address.
   */
  source: string;
  /**
   * The SES source ARN to use.
   */
  sourceArn: string;
  /**
   * The SES region to use.
   */
  region: string;
}
