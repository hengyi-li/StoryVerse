import type { StoryTypeId } from "./story-types.ts";

export const STORY_ANALYSIS_FAIL_OPEN_VERSION = "storyverse-analysis-fail-open-v1";

export type StoryAnalysisFallback = {
  suggestedTitle: string;
  typeId: StoryTypeId;
  typeConfidence: number;
  typeCandidates: Array<{ typeId: StoryTypeId; score: number }>;
  themes: [string, string];
};

export function createStoryAnalysisFallback(input: {
  title: string;
  body: string;
  fallbackTypeId?: StoryTypeId;
}): StoryAnalysisFallback {
  const isChinese = /[\u3400-\u9fff]/u.test(`${input.title}\n${input.body}`);
  const typeId: StoryTypeId = input.fallbackTypeId ?? "other_or_unclassifiable";

  return {
    suggestedTitle: input.title.trim() || (isChinese ? "我的故事" : "My Story"),
    typeId,
    typeConfidence: 0,
    typeCandidates: [{ typeId, score: 0 }],
    themes: isChinese ? ["人生经历", "个人感受"] : ["Life experience", "Personal reflection"],
  };
}
