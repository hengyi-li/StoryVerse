import { describe, expect, it } from "vitest";
import {
  isTransientImageGenerationError,
  shouldRetryImageGeneration,
  STORY_IMAGE_ATTEMPT_TIMEOUT_MS,
  STORY_IMAGE_MAX_AUTOMATIC_RETRIES,
  STORY_IMAGE_RETRY_DELAY_SECONDS,
} from "../supabase/functions/_shared/image-worker-policy.ts";

describe("故事图片后台重试策略", () => {
  it("保留 2K 质量，并用两次有界尝试吸收模型长尾", () => {
    expect(STORY_IMAGE_ATTEMPT_TIMEOUT_MS).toBe(55_000);
    expect(STORY_IMAGE_MAX_AUTOMATIC_RETRIES).toBe(1);
    expect(STORY_IMAGE_RETRY_DELAY_SECONDS).toBe(3);
  });

  it.each([
    "The signal has been aborted",
    "AbortError: timed out",
    "fetch failed",
    "network connection reset",
    "Ark 429: too many requests",
    "Ark 500: internal error",
    "Could not download generated image (503)",
  ])("将可恢复故障识别为临时错误：%s", (message) => {
    expect(isTransientImageGenerationError(new Error(message))).toBe(true);
  });

  it.each(["Ark 400: invalid prompt", "Sensitive content", "Storage quota exceeded"])(
    "不会对确定性失败进行无意义重试：%s",
    (message) => {
      expect(isTransientImageGenerationError(new Error(message))).toBe(false);
    },
  );

  it("最多自动重试一次", () => {
    const transient = new Error("The signal has been aborted");
    expect(shouldRetryImageGeneration(transient, 0)).toBe(true);
    expect(shouldRetryImageGeneration(transient, 1)).toBe(false);
  });
});
