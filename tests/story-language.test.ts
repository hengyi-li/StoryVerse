import { describe, expect, it } from "vitest";
import { detectStoryLanguage, storyNeedsTranslation, storyTranslationTarget } from "../src/lib/story-language";

describe("故事原文语言与翻译方向", () => {
  it("识别中文、英文和以英文为主的混合故事", () => {
    expect(detectStoryLanguage("那一年，我第一次独自离开家乡。".repeat(8))).toBe("zh");
    expect(detectStoryLanguage("That year, I left my hometown alone for the first time. ".repeat(8))).toBe("en");
    expect(detectStoryLanguage(`北京 ${"I learned to begin again with help from my friends. ".repeat(8)}`)).toBe("en");
  });

  it("中文故事只需要英文缓存，英文故事只需要中文缓存", () => {
    const chineseStory = { body: "这是中文故事。".repeat(20) };
    const englishStory = { body: "This is an English story. ".repeat(20) };
    expect(storyTranslationTarget(chineseStory)).toBe("en");
    expect(storyTranslationTarget(englishStory)).toBe("zh");
    expect(storyNeedsTranslation(chineseStory, "zh")).toBe(false);
    expect(storyNeedsTranslation(englishStory, "zh")).toBe(true);
  });
});
