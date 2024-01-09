import * as AWSTranslate from '@aws-sdk/client-translate';
import {
  Languages,
  PDFEntity,
  PDFTemplateComplexField,
  PDFTemplateSection,
  PDFTemplateSectionTypes,
  PDFTemplateSimpleField
} from 'idea-toolbox';

/**
 * A wrapper for Amazon Translate.
 */
export class Translate {
  protected translate: AWSTranslate.TranslateClient;

  /**
   * Default input language code.
   */
  sourceLanguageCode = 'en';
  /**
   * Default output language code.
   */
  targetLanguageCode = 'en';
  /**
   * Default terminology list.
   */
  terminologyNames: string[] = [];

  /**
   * Initialize a new Translate helper object.
   */
  constructor(options: { region?: string } = {}) {
    this.translate = new AWSTranslate.TranslateClient({ region: options.region });
  }

  /**
   * Translates input text from the source language to the target language.
   * @param params the parameters for translateText
   */
  async text(params: TranslateParameters): Promise<string> {
    if (params.sourceLanguageCode) this.sourceLanguageCode = params.sourceLanguageCode;
    if (params.targetLanguageCode) this.targetLanguageCode = params.targetLanguageCode;
    if (params.terminologyNames) this.terminologyNames = params.terminologyNames;

    if (!this.sourceLanguageCode || !this.targetLanguageCode || !params.text) throw new Error('Bad parameters');

    const command = new AWSTranslate.TranslateTextCommand({
      Text: params.text,
      SourceLanguageCode: this.sourceLanguageCode,
      TargetLanguageCode: this.targetLanguageCode,
      TerminologyNames: this.terminologyNames
    });
    const { TranslatedText } = await this.translate.send(command);

    return TranslatedText;
  }

  /**
   * Get the contents of a PDF template (against a PDFEntity) translated in the desired language,
   * if the latter isn't between the ones already available.
   * @return an object that maps original texts with their translations (or nothing).
   */
  async pdfTemplate(
    entity: PDFEntity,
    template: PDFTemplateSection[],
    language: string,
    languages: Languages
  ): Promise<Record<string, string>> {
    // if the language is included in the ones supported by the team, skip
    if (languages.available.some(l => l === language)) return null;

    // analyse the template to extract terms to translate based on the entity (using a sourceLanguage as reference)
    const termsToTranslate = Array.from(
      await this.analysePDFTemplateForTermsToTranslate(template, entity, languages.default)
    );

    const translations: { [original: string]: string } = {};
    for (let i = 0; i < termsToTranslate.length; i++) {
      const original = termsToTranslate[i];
      const translated = await this.text({
        sourceLanguageCode: languages.default,
        targetLanguageCode: language,
        text: original
      });
      translations[original] = translated
        // fix markdown issue (the translations add a space before and after asterisks)
        .replace(/\*\* /gm, '**')
        .replace(/ \*\*/gm, '**');
    }
    return translations;
  }
  /**
   * Analyse a PDFTemplate to extract terms to translate based on a PDFEntity (using a sourceLanguage as reference).
   */
  protected async analysePDFTemplateForTermsToTranslate(
    template: PDFTemplateSection[],
    entity: PDFEntity,
    sourceLanguage: string
  ): Promise<Set<string>> {
    const toTranslate = new Set<string>();
    // gather the terms to translate from contents available on this level
    template
      .filter(s => s.isEither(PDFTemplateSectionTypes.ROW, PDFTemplateSectionTypes.HEADER))
      .forEach(s => {
        switch (s.type) {
          case PDFTemplateSectionTypes.ROW:
            s.columns
              .filter((_, index): boolean => s.doesColumnContainAField(index))
              .forEach(field => {
                field = field as PDFTemplateSimpleField | PDFTemplateComplexField;
                if (field.isComplex()) {
                  const complex = field as PDFTemplateComplexField;
                  toTranslate.add(complex.content[sourceLanguage]);
                } else {
                  const simple = field as PDFTemplateSimpleField;
                  toTranslate.add(simple.label[sourceLanguage]);
                  // try to consider only notes (long fields)
                  if (typeof entity[simple.code] === 'string' && entity[simple.code].length > 50)
                    toTranslate.add(entity[simple.code]);
                }
              });
            break;
          case PDFTemplateSectionTypes.HEADER:
            toTranslate.add(s.title[sourceLanguage]);
            break;
        }
      });
    // gather inner sections in a flat structure for further elaboraton
    const innerSections = new Array<{ data: any; template: PDFTemplateSection[] }>();
    template
      .filter(s => s.isEither(PDFTemplateSectionTypes.INNER_SECTION, PDFTemplateSectionTypes.REPEATED_INNER_SECTION))
      .forEach(s => {
        switch (s.type) {
          case PDFTemplateSectionTypes.INNER_SECTION:
            innerSections.push({ data: entity[s.context], template: s.innerTemplate });
            break;
          case PDFTemplateSectionTypes.REPEATED_INNER_SECTION:
            entity[s.context].forEach((element: PDFEntity): number =>
              innerSections.push({ data: element, template: s.innerTemplate })
            );
            break;
        }
      });
    // run (inception) the inner sections to gather terms to translate from inner levels
    for (let i = 0; i < innerSections.length; i++) {
      const s = innerSections[i];
      const res = await this.analysePDFTemplateForTermsToTranslate(s.template, s.data, sourceLanguage);
      res.forEach(x => toTranslate.add(x));
    }
    return toTranslate;
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
  terminologyNames?: string[];
}
