import { Lambda } from 'aws-sdk';
import IdeaX = require('idea-toolbox');
import { S3 } from './s3';

/**
 * A custom class that takes advantage of the `idea_html2pdf` Lambda function to easily manage the creation of PDFs.
 */
export class HTML2PDF {
  /**
   * The instance of Lambda.
   */
  protected lambda: Lambda;
  /**
   * The instance of S3.
   */
  protected s3: S3;
  /**
   * The name of the default Lambda function to invoke.
   */
  protected LAMBDA_NAME = 'idea_html2pdf:prod';

  constructor() {
    this.lambda = new Lambda();
    this.s3 = new S3();
  }

  /**
   * Create a new PDF created by an HTML source.
   * @param params the parameters to create the PDF
   * @param alternativeLambda an alternative lambda function to use to generate the PDF
   * @return the PDF data (buffer)
   */
  public create(params: HTML2PDFParameters, alternativeLambda?: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.lambda.invoke(
        {
          FunctionName: alternativeLambda || this.LAMBDA_NAME,
          InvocationType: 'RequestResponse',
          Payload: JSON.stringify(params)
        },
        (err: Error, data: any) => {
          if (err) {
            IdeaX.logger('PDF creation failed', err, alternativeLambda || this.LAMBDA_NAME);
            reject(err);
          } else resolve(Buffer.from(data.Payload, 'base64'));
        }
      );
    });
  }

  /**
   * Create the signedURL to a new PDF created by an HTML source.
   * @param params the parameters to create the PDF
   * @param alternativeLambda an alternative lambda function to use to generate the PDF
   * @param downloadOptions the parameters create the download link
   * @return the URL to download the PDF
   */
  public createLink(
    params: HTML2PDFParameters,
    alternativeLambda?: string,
    downloadOptions?: any
  ): Promise<IdeaX.SignedURL> {
    return new Promise((resolve, reject) => {
      this.create(params, alternativeLambda)
        .then(pdfData => resolve(this.s3.createDownloadURLFromData(pdfData, downloadOptions)))
        .catch(err => reject(err));
    });
  }
}

export interface HTML2PDFParameters {
  /**
   * The html main body.
   */
  body: string;
  /**
   * An optional html header, repeated in every page.
   */
  header: string;
  /**
   * An optional html footer, repeated in every page.
   */
  footer: string;
  /**
   * Options following the standard of Puppeteer.
   */
  pdfOptions: any;
}
