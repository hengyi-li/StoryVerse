import { describe, expect, it } from "vitest";
import {
  ARK_IMAGE_GENERATION_PATH,
  createArkImageGenerationRequest,
  readSingleArkImage,
} from "../supabase/functions/_shared/image-generation.ts";

describe("火山方舟图片生成", () => {
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
});
