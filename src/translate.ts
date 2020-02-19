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
   * @param options
   * ```
   * sourceLanguageCode: string;  // required.
   * targetLanguageCode: string;  // required.
   * text: string;                // Text to translate. Max. 5,000 bytes.
   * terminologyNames?: Array<string>;  // The name of the terminology list file to be used in the TranslateText
   *                                       request. You can use 1 terminology list at most in a TranslateText request.
   *                                       Terminology lists can contain a maximum of 256 terms.
   * ```
   */
  public translateText(options: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // if needed, randomly generates the key
      if (!options.sourceLanguageCode || !options.targetLanguageCode) return reject();
      this.translate.translateText(
        {
          SourceLanguageCode: options.sourceLanguageCode,
          TargetLanguageCode: options.targetLanguageCode,
          Text: options.text,
          TerminologyNames: options.terminologyNames
        },
        (err: Error, data: any) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });
  }
}
