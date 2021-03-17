import { AWSError, Comprehend as AmazonComprehend } from 'aws-sdk';

/**
 * A wrapper for Amazon Comprehend.
 */
export class Comprehend {
  /**
   * The instance of Comprehend.
   */
  protected comprehend: AmazonComprehend;

  constructor() {
    this.comprehend = new AmazonComprehend({ apiVersion: '2017-11-27' });
  }

  /**
   * Inspects text and returns an inference of the prevailing sentiment (POSITIVE, NEUTRAL, MIXED, or NEGATIVE).
   */
  public detectSentiment(params: ComprehendParameters): Promise<string> {
    return new Promise((resolve, reject) => {
      // check for obligatory params
      if (!params.languageCode || !params.text) return reject(new Error('MISSING_PARAMETERS'));
      // execute the sentiment detection
      this.comprehend.detectSentiment(
        { LanguageCode: params.languageCode, Text: params.text },
        (err: AWSError, data: AmazonComprehend.DetectSentimentResponse) => {
          if (err) reject(err);
          else resolve(data.Sentiment);
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
