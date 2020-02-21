import AWS = require('aws-sdk');

/**
 * A wrapper for Amazon Translate.
 */
export class Translate {
  protected translate: AWS.Translate;

  /**
   * Initialize a new Translate helper object.
   */
  constructor() {
    this.translate = new AWS.Translate({ apiVersion: '2017-07-01' });
  }

  /**
   * Translates input text from the source language to the target language.
   * @param params the parameters to invoke translateText
   */
  public translateText(params: TranslateParameters): Promise<any> {
    return new Promise((resolve, reject) => {
      // if needed, randomly generates the key
      if (!params.sourceLanguageCode || !params.targetLanguageCode || !params.text) return reject();
      this.translate.translateText(
        {
          SourceLanguageCode: params.sourceLanguageCode,
          TargetLanguageCode: params.targetLanguageCode,
          Text: params.text,
          TerminologyNames: params.terminologyNames
        },
        (err: Error, data: any) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
  }
}

export interface TranslateParameters {
  /**
   * The language code for the language of the source text. Required.
   */
  sourceLanguageCode: string;
  /**
   * The language code requested for the language of the target text. Required.
   */
  targetLanguageCode: string;
  /**
   * The text to translate. The text string can be a maximum of 5,000 bytes long.
   * Depending on your character set, this may be fewer than 5,000 characters.
   * Required.
   */
  text: string;
  /**
   * The name of the terminology list file to be used in the TranslateText request.
   * You can use 1 terminology list at most in a TranslateText request.
   * Terminology lists can contain a maximum of 256 terms.
   */
  terminologyNames?: Array<string>;
}
