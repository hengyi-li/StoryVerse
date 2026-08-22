export type StoryTranslationLanguage = "zh" | "en";

export function detectTranslationSourceLanguage(body: string): StoryTranslationLanguage {
  const cjkCharacters = (body.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWords = (body.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length;
  if (!cjkCharacters && latinWords) return "en";
  if (!latinWords && cjkCharacters) return "zh";
  return cjkCharacters >= latinWords ? "zh" : "en";
}

export function translationDirectionInstruction(targetLanguage: StoryTranslationLanguage) {
  return targetLanguage === "en"
    ? {
        instruction: "Translate every value not already written in English into faithful, natural English.",
        targetName: "English",
      }
    : {
        instruction: "Translate every value not already written in Chinese into faithful, natural Simplified Chinese.",
        targetName: "Simplified Chinese",
      };
}
