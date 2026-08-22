import type { Language, Story } from "../types/domain";

/** 根据正文的主要书写系统判断故事原文语言；混合文本按中英文有效词素数量判定。 */
export function detectStoryLanguage(text: string): Language {
  const cjkCharacters = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWords = (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length;
  if (!cjkCharacters && latinWords) return "en";
  if (!latinWords && cjkCharacters) return "zh";
  return cjkCharacters >= latinWords ? "zh" : "en";
}

export function storyTranslationTarget(story: Pick<Story, "body">): Language {
  return detectStoryLanguage(story.body) === "zh" ? "en" : "zh";
}

export function storyNeedsTranslation(story: Pick<Story, "body">, interfaceLanguage: Language) {
  return detectStoryLanguage(story.body) !== interfaceLanguage;
}
