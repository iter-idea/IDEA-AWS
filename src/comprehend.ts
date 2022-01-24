import { Comprehend as AmazonComprehend } from 'aws-sdk';
import { Sentiment } from 'idea-toolbox';

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
  async detectSentiment(params: ComprehendParameters): Promise<Sentiment> {
    if (!params.language || !params.text) throw new Error('Missing some parameters');

    const result = await this.comprehend
      .detectSentiment({ LanguageCode: params.language, Text: params.text })
      .promise();

    return result.Sentiment as Sentiment;
  }
}

export interface ComprehendParameters {
  /**
   * The language of the input contents. You can specify any of the primary languages supported by Amazon Comprehend.
   * All contents must be in the same language. Required.
   * Valid Values: en | es | fr | de | it | pt | ar | hi | ja | ko | zh | zh-TW
   */
  language: string;
  /**
   * The text to analyze. Required.
   * A UTF-8 text string. Each string must contain fewer that 5,000 bytes of UTF-8 encoded characters.
   */
  text: string;
}
