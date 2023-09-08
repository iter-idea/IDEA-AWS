import * as AmazonComprehend from '@aws-sdk/client-comprehend';
import { Sentiment } from 'idea-toolbox';

/**
 * A wrapper for Amazon Comprehend.
 */
export class Comprehend {
  /**
   * The instance of Comprehend.
   */
  protected comprehend: AmazonComprehend.ComprehendClient;

  constructor(params?: { region?: string }) {
    const options = Object.assign({}, params);
    this.comprehend = new AmazonComprehend.ComprehendClient({ region: options.region });
  }

  /**
   * Inspects text and returns an inference of the prevailing sentiment (POSITIVE, NEUTRAL, MIXED, or NEGATIVE).
   */
  async detectSentiment(params: DetectSentimentParameters): Promise<Sentiment> {
    if (!params.language || !params.text) throw new Error('Missing some parameters');

    const command = new AmazonComprehend.DetectSentimentCommand({ LanguageCode: params.language, Text: params.text });
    const result = await this.comprehend.send(command);

    return result.Sentiment as Sentiment;
  }

  /**
   * Determines the dominant language of the input text.
   */
  async detectDominantLanguage(params: { text: string }): Promise<string> {
    if (!params.text) throw new Error('Missing text');

    const command = new AmazonComprehend.DetectDominantLanguageCommand({ Text: params.text });
    const result = await this.comprehend.send(command);
    if (!result.Languages.length) throw new Error('Not found');

    return result.Languages[0].LanguageCode;
  }
}

export interface DetectSentimentParameters {
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
