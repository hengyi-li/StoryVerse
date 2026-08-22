import { ApiError } from "./http.ts";

export const POSTTEST_VERSION = "posttest_v1";

function numberedIds(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => `${prefix}_${String(index + 1).padStart(2, "0")}`);
}

export const POSTTEST_SECTION_ITEM_IDS = [
  numberedIds("engagement", 8),
  numberedIds("publicness", 10),
  numberedIds("diversity", 7),
  numberedIds("recommendation", 10),
  numberedIds("authorship_ai", 6),
] as const;

export const POSTTEST_ITEM_IDS = POSTTEST_SECTION_ITEM_IDS.flat();
const allowedItemIds = new Set(POSTTEST_ITEM_IDS);

export type PosttestScore = 1 | 2 | 3 | 4 | 5;
export type PosttestAnswers = Record<string, PosttestScore>;

export function validatePosttestStep(step: unknown): 1 | 2 | 3 | 4 | 5 {
  const normalized = Number(step);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 5) {
    throw new ApiError(400, "INVALID_POSTTEST_STEP", "问卷步骤不正确。 / Invalid post-study step.");
  }
  return normalized as 1 | 2 | 3 | 4 | 5;
}

export function normalizePosttestAnswers(input: unknown): PosttestAnswers {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError(400, "INVALID_POSTTEST_ANSWERS", "问卷答案格式不正确。 / Invalid response format.");
  }
  const normalized: PosttestAnswers = {};
  for (const [itemId, rawScore] of Object.entries(input as Record<string, unknown>)) {
    if (!allowedItemIds.has(itemId)) {
      throw new ApiError(400, "UNKNOWN_POSTTEST_ITEM", "问卷中包含未知题项。 / The response contains an unknown item.");
    }
    if (typeof rawScore !== "number" || !Number.isInteger(rawScore) || rawScore < 1 || rawScore > 5) {
      throw new ApiError(400, "INVALID_POSTTEST_SCORE", "每道题只能选择 1–5 分。 / Each item must be scored 1–5.");
    }
    normalized[itemId] = rawScore as PosttestScore;
  }
  return normalized;
}

export function requirePosttestAnswers(answers: PosttestAnswers, throughStep: 1 | 2 | 3 | 4 | 5) {
  const requiredIds = POSTTEST_SECTION_ITEM_IDS.slice(0, throughStep).flat();
  const missing = requiredIds.filter((itemId) => answers[itemId] == null);
  if (missing.length) {
    throw new ApiError(
      400,
      "POSTTEST_ANSWER_REQUIRED",
      `请完成当前部分的所有题目。 / Complete every item in this section. (${missing[0]})`,
    );
  }
  return answers;
}
