import * as AWSSES from '@aws-sdk/client-sesv2';
import {
  createTransport as NodemailerCreateTransport,
  SentMessageInfo as NodemailerSentMessageInfo,
  SendMailOptions as NodemailerSendMailOptions
} from 'nodemailer';
import { Headers } from 'nodemailer/lib/mailer';

import { DynamoDB } from './dynamoDB';
import { LambdaLogger } from './lambdaLogger';

/**
 * A wrapper for AWS Simple Email Service.
 */
export class SES {
  client: AWSSES.SESv2Client;
  protected logger = new LambdaLogger();

  constructor(options: { region?: string } = {}) {
    this.client = new AWSSES.SESv2Client({ region: options.region });
  }

  //
  // CONFIG
  //

  async getTemplate(templateName: string): Promise<AWSSES.EmailTemplateContent> {
    const command = new AWSSES.GetEmailTemplateCommand({ TemplateName: templateName });
    const { TemplateContent } = await this.client.send(command);
    return TemplateContent;
  }
  async setTemplate(templateName: string, subject: string, content: string, isHTML?: boolean): Promise<void> {
    let isNew = false;
    try {
      const command = new AWSSES.GetEmailTemplateCommand({ TemplateName: templateName });
      await this.client.send(command);
    } catch (_) {
      isNew = true;
    }

    const template: AWSSES.CreateEmailTemplateCommandInput | AWSSES.UpdateEmailTemplateCommandInput = {
      TemplateName: templateName,
      TemplateContent: { Subject: subject }
    };
    if (isHTML) template.TemplateContent.Html = content;
    else template.TemplateContent.Text = content;

    let command: AWSSES.CreateEmailTemplateCommand | AWSSES.UpdateEmailTemplateCommand;
    if (isNew) command = new AWSSES.CreateEmailTemplateCommand(template);
    else command = new AWSSES.UpdateEmailTemplateCommand(template);

    await this.client.send(command);
  }
  async deleteTemplate(templateName: string): Promise<void> {
    const command = new AWSSES.DeleteEmailTemplateCommand({ TemplateName: templateName });
    await this.client.send(command);
  }
  async testTemplate(templateName: string, data: { [variable: string]: any }): Promise<string> {
    const command = new AWSSES.TestRenderEmailTemplateCommand({
      TemplateName: templateName,
      TemplateData: JSON.stringify(data)
    });
    const { RenderedTemplate } = await this.client.send(command);
    return RenderedTemplate;
  }

  //
  // SENDING
  //

  /**
   * Send a templated email through AWS Simple Email Service.
   */
  async sendTemplatedEmail(
    emailData: TemplatedEmailData,
    sesParams: SESParams
  ): Promise<AWSSES.SendEmailCommandOutput> {
    const command = new AWSSES.SendEmailCommand({
      Destination: this.prepareEmailDestination(emailData),
      Content: {
        Template: {
          TemplateName: emailData.template,
          TemplateData: JSON.stringify(emailData.templateData ?? {})
        }
      },
      ConfigurationSetName: emailData.configurationSet,
      ReplyToAddresses: emailData.replyToAddresses,
      FromEmailAddress: sesParams.sourceName ? `${sesParams.sourceName} <${sesParams.source}>` : sesParams.source,
      FromEmailAddressIdentityArn: sesParams.sourceArn
    });

    let ses: AWSSES.SESv2Client;
    if (this.client.config.region === sesParams.region) ses = this.client;
    else ses = new AWSSES.SESv2Client({ region: sesParams.region });

    this.logger.trace('SES send templated email');
    return await ses.send(command);
  }

  /**
   * Send an email through AWS Simple Email Service.
   * It supports IDEA's teams custom configuration.
   */
  async sendEmail(
    emailData: EmailData,
    sesParams: SESParams
  ): Promise<AWSSES.SendEmailResponse | NodemailerSentMessageInfo> {
    // if requested, check whether there is a custom SES configuration to apply for the team
    const customSESConfig = await this.searchForCustomSESConfigByTeamId(sesParams.teamId);

    // if the email includes attachments, send with Nodemailer (to avoid size limitations)
    if (emailData.attachments?.length)
      return await this.sendEmailWithNodemailer(emailData, customSESConfig || sesParams);
    // otherwise, send with SES (more secure)
    else return await this.sendEmailWithSES(emailData, customSESConfig || sesParams);
  }
  private async searchForCustomSESConfigByTeamId(teamId: string): Promise<SESParams | null> {
    if (!teamId) return null;
    try {
      return (await new DynamoDB().get({ TableName: 'idea_teamsSES', Key: { teamId } })) as SESParams;
    } catch (_) {
      return null;
    }
  }
  private async sendEmailWithSES(emailData: EmailData, sesParams: SESParams): Promise<AWSSES.SendEmailCommandOutput> {
    const command = new AWSSES.SendEmailCommand({
      Destination: this.prepareEmailDestination(emailData),
      Content: { Simple: this.prepareEmailMessage(emailData) },
      ReplyToAddresses: emailData.replyToAddresses,
      FromEmailAddress: sesParams.sourceName ? `${sesParams.sourceName} <${sesParams.source}>` : sesParams.source,
      FromEmailAddressIdentityArn: sesParams.sourceArn
    });

    let ses: AWSSES.SESv2Client;
    if (this.client.config.region === sesParams.region) ses = this.client;
    else ses = new AWSSES.SESv2Client({ region: sesParams.region });

    this.logger.trace('SES send email');
    return await ses.send(command);
  }
  private async sendEmailWithNodemailer(
    emailData: EmailData,
    sesParams: SESParams
  ): Promise<NodemailerSendMailOptions> {
    const mailOptions: NodemailerSendMailOptions = {};

    mailOptions.to = emailData.toAddresses.join(',');
    if (emailData.ccAddresses) mailOptions.cc = emailData.ccAddresses.join(',');
    if (emailData.bccAddresses) mailOptions.bcc = emailData.bccAddresses.join(',');

    mailOptions.from = sesParams.sourceName ? `${sesParams.sourceName} <${sesParams.source}>` : sesParams.source;
    if (emailData.replyToAddresses) mailOptions.replyTo = emailData.replyToAddresses.join(',');

    mailOptions.subject = emailData.subject;
    if (emailData.html) mailOptions.html = emailData.html;
    if (emailData.text) mailOptions.text = emailData.text;

    mailOptions.attachments = emailData.attachments;

    const sesClient = new AWSSES.SESv2Client({ region: sesParams.region });
    const SendEmailCommand = AWSSES.SendEmailCommand;

    this.logger.trace('SES send email (Nodemailer)');
    return await NodemailerCreateTransport({ SES: { sesClient, SendEmailCommand } }).sendMail(mailOptions);
  }

  private prepareEmailDestination(emailData: BasicEmailData): AWSSES.Destination {
    return {
      ToAddresses: emailData.toAddresses,
      CcAddresses: emailData.ccAddresses,
      BccAddresses: emailData.bccAddresses
    };
  }
  private prepareEmailMessage(emailData: EmailData): AWSSES.Message {
    const message: AWSSES.Message = {
      Subject: { Charset: 'UTF-8', Data: emailData.subject },
      Body: {}
    };
    if (emailData.html) message.Body.Html = { Charset: 'UTF-8', Data: emailData.html };
    if (emailData.text) message.Body.Text = { Charset: 'UTF-8', Data: emailData.text };
    if (!emailData.html && !emailData.text) message.Body.Text = { Charset: 'UTF-8', Data: '' };
    return message;
  }
}

/**
 * The basic data to send an email.
 */
export interface BasicEmailData {
  /**
   * Array of TO email addresses.
   */
  toAddresses: string[];
  /**
   * Array of CC email addresses.
   */
  ccAddresses?: string[];
  /**
   * Array of BCC email addresses.
   */
  bccAddresses?: string[];
  /**
   * Array of Reply-To email addresses.
   */
  replyToAddresses?: string[];
}
/**
 * The data to send an email.
 */
export interface EmailData extends BasicEmailData {
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
  attachments?: EmailAttachment[];
}
/**
 * Email attachment interface of Nodemailer.
 */
export interface EmailAttachment {
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
   */
  filename?: string | false;
  /**
   * If set and content is string, then encodes the content to a Buffer using the specified encoding.
   * Example values: base64, hex, binary etc. Useful if you want to use binary attachments in a JSON formatted e-mail.
   */
  encoding?: string;
  /**
   * Optional content type for the attachment, if not set will be derived from the filename property
   */
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
 * The data to send a templated email.
 * Note: templated email don't support attachments by now.
 */
export interface TemplatedEmailData extends BasicEmailData {
  /**
   * The template to use for sending the email.
   * To reference variables, use placeholders such as `{{myVar}}`.
   */
  template: string;
  /**
   * An object containing key-value pairs of variable-content to substitute.
   * It supports handlebars.js templating.
   */
  templateData: { [variable: string]: any };
  /**
   * The name of the configuration set to use for the sending.
   */
  configurationSet?: string;
}

/**
 * SES configuration.
 */
export interface SESParams {
  /**
   * The source (from) email address.
   */
  source: string;
  /**
   * The optional name of the source (e.g. Matteo Carbone).
   */
  sourceName?: string;
  /**
   * The SES source ARN to use, in case the source doesn't directly match a SES validated email address.
   */
  sourceArn?: string;
  /**
   * The SES region to use, in case it differs from the one of the Lambda function running the command.
   */
  region?: string;
  /**
   * If set, a custom SES configuration to use for the team will be searched in the table `idea_teamsSES`.
   */
  teamId?: string;
}
