import { Comprehend as AmazonComprehend } from 'aws-sdk';

/**
 * A wrapper for Amazon Comprehend.
 */
export class Comprehend {
  protected comprehend: AmazonComprehend;
  /**
   * The language of the input documents. You can specify any of the primary languages supported by Amazon Comprehend.
   * All documents must be in the same language.
   */
  public languageCode: string;
  /**
   * A UTF-8 text string. Each string must contain fewer that 5,000 bytes of UTF-8 encoded characters.
   */
  public text: string;

  /**
   * Initialize a new Comprehend helper object.
   */
  constructor() {
    this.comprehend = new AmazonComprehend({ apiVersion: '2017-11-27' });
  }

  /**
   * Inspects text and returns an inference of the prevailing sentiment (POSITIVE, NEUTRAL, MIXED, or NEGATIVE).
   * @param params the parameters for detectSentiment
   */
  public detectSentiment(params: ComprehendParameters): Promise<string> {
    return new Promise((resolve, reject) => {
      // load source and target languages codes
      if (params.languageCode) this.languageCode = params.languageCode;
      if (params.text) this.text = params.text;
      // check for obligatory params
      if (!this.languageCode || !this.text) return reject();
      // execute the sentiment detection
      this.comprehend.detectSentiment(
        { LanguageCode: params.languageCode, Text: params.text },
        (err: Error, data: any) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
  }
}

export interface ComprehendParameters {
  /**
   * The language of the input documents. You can specify any of the primary languages supported by Amazon Comprehend.
   * All documents must be in the same language. Required.
   * Valid Values: en | es | fr | de | it | pt | ar | hi | ja | ko | zh | zh-TW
   */
  languageCode: string;
  /**
   * The text to analyze. Required.
   * A UTF-8 text string. Each string must contain fewer that 5,000 bytes of UTF-8 encoded characters.
   */
  text: string;
}
