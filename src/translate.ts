import AWS = require('aws-sdk');
import IdeaX = require('idea-toolbox');

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

  /**
   * Get the contents of a PDF template (against a PDFEntity) translated in the desired language,
   * if the latter isn't between the ones already available.
   * @return an object that maps original texts with their translations (or nothing).
   */
  public pdfTemplate(
    entity: IdeaX.PDFEntity,
    template: Array<IdeaX.PDFTemplateSection>,
    language: string,
    languages: IdeaX.Languages
  ): Promise<{ [original: string]: string }> {
    return new Promise(resolve => {
      // if the language is included in the ones supported by the team, skip
      if (languages.available.some(l => l === language)) return resolve();
      // analyse the template to extract terms to translate based on the entity (using a sourceLanguage as reference)
      this.analysePDFTemplateForTermsToTranslate(template, entity, languages.default).then(termsToTranslate => {
        const translations: { [original: string]: string } = {};
        Array.from(termsToTranslate).forEach(async original => {
          const translated = await this.text({
            sourceLanguageCode: languages.default,
            targetLanguageCode: language,
            text: original
          });
          translations[original] = translated
            // fix markdown issue (the translations add a space before and after asterisks)
            .replace(/\*\* /gm, '**')
            .replace(/ \*\*/gm, '**');
        });
        resolve(translations);
      });
    });
  }
  /**
   * Analyse a PDFTemplate to extract terms to translate based on a PDFEntity (using a sourceLanguage as reference).
   */
  protected analysePDFTemplateForTermsToTranslate(
    template: Array<IdeaX.PDFTemplateSection>,
    entity: IdeaX.PDFEntity,
    sourceLanguage: string
  ): Promise<Set<string>> {
    return new Promise(resolve => {
      const toTranslate = new Set<string>();
      // gather the terms to translate from contents available on this level
      template
        .filter(s => s.isEither(IdeaX.PDFTemplateSectionTypes.ROW, IdeaX.PDFTemplateSectionTypes.HEADER))
        .forEach(s => {
          switch (s.type) {
            case IdeaX.PDFTemplateSectionTypes.ROW:
              s.columns
                .filter((_, index) => s.doesColumnContainAField(index))
                .forEach(field => {
                  field = field as IdeaX.PDFTemplateSimpleField | IdeaX.PDFTemplateComplexField;
                  if (field.isComplex()) {
                    const complex = field as IdeaX.PDFTemplateComplexField;
                    toTranslate.add(complex.content[sourceLanguage]);
                  } else {
                    const simple = field as IdeaX.PDFTemplateSimpleField;
                    toTranslate.add(simple.label[sourceLanguage]);
                    // try to consider only notes (long fields)
                    if (typeof entity[simple.code] === 'string' && entity[simple.code].length > 50)
                      toTranslate.add(entity[simple.code]);
                  }
                });
              break;
            case IdeaX.PDFTemplateSectionTypes.HEADER:
              toTranslate.add(s.title[sourceLanguage]);
              break;
          }
        });
      // gather inner sections in a flat structure for further elaboraton
      const innerSections = new Array<{ data: any; template: Array<IdeaX.PDFTemplateSection> }>();
      template
        .filter(s =>
          s.isEither(IdeaX.PDFTemplateSectionTypes.INNER_SECTION, IdeaX.PDFTemplateSectionTypes.REPEATED_INNER_SECTION)
        )
        .forEach(s => {
          switch (s.type) {
            case IdeaX.PDFTemplateSectionTypes.INNER_SECTION:
              innerSections.push({ data: entity[s.context], template: s.innerTemplate });
              break;
            case IdeaX.PDFTemplateSectionTypes.REPEATED_INNER_SECTION:
              entity[s.context].forEach((element: IdeaX.PDFEntity) =>
                innerSections.push({ data: element, template: s.innerTemplate })
              );
              break;
          }
        });
      // run (inception) the inner sections to gather terms to translate from inner levels
      innerSections.forEach(async s => {
        const res = await this.analysePDFTemplateForTermsToTranslate(s.template, s.data, sourceLanguage);
        res.forEach(x => toTranslate.add(x));
      });
      resolve(toTranslate);
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
