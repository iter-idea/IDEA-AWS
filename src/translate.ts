import AWS = require('aws-sdk');

/**
 * A wrapper for Amazon Translate.
 */
export class Translate {
  protected translate: AWS.Translate;
  /**
   * Default input language code.
   */
  public sourceLanguageCode: string;
  /**
   * Default output language code.
   */
  public targetLanguageCode: string;
  /**
   * Default terminology list.
   */
  public terminologyNames: Array<string>;

  /**
   * Initialize a new Translate helper object.
   */
  constructor() {
    this.translate = new AWS.Translate({ apiVersion: '2017-07-01' });
    this.sourceLanguageCode = 'en';
    this.targetLanguageCode = 'en';
    this.terminologyNames = new Array<string>();
  }

  /**
   * Translates input text from the source language to the target language.
   * @param params the parameters for translateText
   */
  public text(params: TranslateParameters): Promise<string> {
    return new Promise((resolve, reject) => {
      // load source and target languages codes
      if (params.sourceLanguageCode) this.sourceLanguageCode = params.sourceLanguageCode;
      if (params.targetLanguageCode) this.targetLanguageCode = params.targetLanguageCode;
      if (params.terminologyNames) this.terminologyNames = params.terminologyNames;
      // check for obligatory params
      if (!this.sourceLanguageCode || !this.targetLanguageCode || !params.text) return reject();
      // execute the translation
      this.translate.translateText(
        {
          Text: params.text,
          SourceLanguageCode: this.sourceLanguageCode,
          TargetLanguageCode: this.targetLanguageCode,
          TerminologyNames: this.terminologyNames
        },
        (err: Error, data: any) => {
          if (err) reject(err);
          else resolve(data.TranslatedText);
        }
      );
    });
  }
}

export interface TranslateParameters {
  /**
   * The text to translate. Required.
   * The text string can be a maximum of 5,000 bytes long; depending on the char set, it may be fewer than 5,000 chars.
   */
  text: string;
  /**
   * The input language.
   */
  sourceLanguageCode?: string;
  /**
   * The output language.
   */
  targetLanguageCode?: string;
  /**
   * The name of the terminology list file to be used in the TranslateText request.
   * Terminology lists can contain a maximum of 256 terms.
   */
  terminologyNames?: Array<string>;
}
