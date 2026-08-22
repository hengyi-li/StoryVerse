import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createStoryAnalysisFallback,
  STORY_ANALYSIS_FAIL_OPEN_VERSION,
} from "../supabase/functions/_shared/story-analysis-fallback.ts";

describe("故事 AI 分析失败时的放行策略", () => {
  it("中文故事使用可编辑的中文默认标签并继续确认", () => {
    expect(createStoryAnalysisFallback({ title: "", body: "这是一次难忘的人生经历。" })).toEqual({
      suggestedTitle: "我的故事",
      typeId: "other_or_unclassifiable",
      typeConfidence: 0,
      typeCandidates: [{ typeId: "other_or_unclassifiable", score: 0 }],
      themes: ["人生经历", "个人感受"],
    });
  });

  it("英文故事使用符合主题长度规则的英文默认标签", () => {
    const fallback = createStoryAnalysisFallback({ title: "A New Chapter", body: "I moved to a new city." });
    expect(fallback.suggestedTitle).toBe("A New Chapter");
    expect(fallback.themes).toEqual(["Life experience", "Personal reflection"]);
  });

  it("默认类型被停用时可以改用当前启用的类型", () => {
    expect(
      createStoryAnalysisFallback({
        title: "",
        body: "一次普通的人生经历。",
        fallbackTypeId: "self_directed_learning",
      }).typeId,
    ).toBe("self_directed_learning");
  });

  it("服务端把 AI 异常记录为 pass，不创建人工审核案件", () => {
    const source = readFileSync(new URL("../supabase/functions/_shared/story-pipeline.ts", import.meta.url), "utf8");
    const failOpenBody = source.slice(
      source.indexOf("async function failOpenStoryAnalysis"),
      source.indexOf("export async function processStoryAnalysis"),
    );
    expect(STORY_ANALYSIS_FAIL_OPEN_VERSION).toBe("storyverse-analysis-fail-open-v1");
    expect(failOpenBody).toContain('decision: "pass"');
    expect(failOpenBody).toContain("savePassedAnalysis");
    expect(failOpenBody).not.toContain("createReviewCase");
    expect(failOpenBody).not.toContain("pending_review");
  });
});
