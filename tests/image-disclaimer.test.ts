import { describe, expect, it } from "vitest";
import { uiCopy } from "../src/data/interface-content";

describe("故事图片 AIGC 说明", () => {
  it("中英文均明确图片为 AIGC 且不代表团队立场", () => {
    expect(uiCopy.zh.imgAiDisclaimer).toContain("AIGC");
    expect(uiCopy.zh.imgAiDisclaimer).toContain("不代表 StoryVerse 团队立场");
    expect(uiCopy.en.imgAiDisclaimer).toContain("AIGC-generated");
    expect(uiCopy.en.imgAiDisclaimer).toContain("does not represent the views of the StoryVerse team");
  });
});
