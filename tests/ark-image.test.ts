import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARK_IMAGE_GENERATION_PATH,
  createArkImageGenerationRequest,
  readSingleArkImage,
} from "../supabase/functions/_shared/image-generation.ts";
import {
  STORY_ANALYSIS_MAX_TOKENS,
  STORY_ANALYSIS_TIMEOUT_MS,
  STORY_IMAGE_TIMEOUT_MS,
} from "../supabase/functions/_shared/ai-runtime.ts";

describe("火山方舟图片生成", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("强制生成一张 2K 正方形 JPEG，避免模型自动生成组图", () => {
    expect(ARK_IMAGE_GENERATION_PATH).toBe("/images/generations");
    expect(createArkImageGenerationRequest("doubao-seedream-5-0-260128", "故事提示词")).toEqual({
      model: "doubao-seedream-5-0-260128",
      prompt: "故事提示词",
      size: "2K",
      sequential_image_generation: "disabled",
      stream: false,
      response_format: "url",
      output_format: "jpeg",
      watermark: false,
    });
  });

  it("只接受恰好一张图片，拒绝空结果和意外组图", () => {
    expect(readSingleArkImage({ data: [{ url: "https://example.com/story.jpg" }] })).toEqual({
      kind: "url",
      value: "https://example.com/story.jpg",
    });
    expect(readSingleArkImage({ data: [] })).toBeNull();
    expect(readSingleArkImage({ data: [{ url: "one" }, { url: "two" }] })).toBeNull();
  });

  it("限制用户等待的 AI 长尾，同时保留 2K 单图质量", () => {
    expect(STORY_ANALYSIS_TIMEOUT_MS).toBe(45_000);
    expect(STORY_ANALYSIS_MAX_TOKENS).toBe(1_200);
    expect(STORY_IMAGE_TIMEOUT_MS).toBe(90_000);
  });

  it("明确命中输入敏感内容时立即改用安全备用提示词", async () => {
    const values: Record<string, string> = {
      ARK_API_KEY: "test-key",
      ARK_IMAGE_MODEL: "test-image-model",
    };
    vi.stubGlobal("Deno", { env: { get: (name: string) => values[name] } });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "InputTextSensitiveContentDetected" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ url: "https://example.com/fallback.jpg" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { createImageWithArk } = await import("../supabase/functions/_shared/ark.ts");
    const result = await createImageWithArk({
      prompt: "完整故事提示词",
      fallbackPrompt: "安全备用提示词",
      style: "clay-3d",
      timeoutMs: 1_000,
    });

    expect(result).toMatchObject({
      kind: "url",
      value: "https://example.com/fallback.jpg",
      usedFallback: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.prompt).toContain("完整故事提示词");
    expect(secondBody.prompt).toContain("安全备用提示词");
  });
});
