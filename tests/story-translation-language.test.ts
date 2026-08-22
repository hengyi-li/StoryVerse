import { describe, expect, it } from "vitest";
import {
  detectTranslationSourceLanguage,
  translationDirectionInstruction,
} from "../supabase/functions/_shared/story-translation-language.ts";

describe("豆包故事双向翻译方向", () => {
  it("与前端一致地识别英文和中文原文", () => {
    expect(detectTranslationSourceLanguage("An English life story. ".repeat(30))).toBe("en");
    expect(detectTranslationSourceLanguage("一段真实的中文人生故事。".repeat(30))).toBe("zh");
  });

  it("为两个目标语言生成明确且相反的指令", () => {
    expect(translationDirectionInstruction("en").instruction).toContain("natural English");
    expect(translationDirectionInstruction("zh").instruction).toContain("natural Simplified Chinese");
  });
});
