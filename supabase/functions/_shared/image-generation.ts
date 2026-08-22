export const ARK_IMAGE_GENERATION_PATH = "/images/generations";

/**
 * StoryVerse keeps exactly one final image per story. Seedream can otherwise
 * decide to create a sequence of images, which makes latency unpredictable and
 * can exceed the Edge Function request timeout.
 */
export function createArkImageGenerationRequest(model: string, prompt: string) {
  return {
    model,
    prompt,
    size: "2K",
    sequential_image_generation: "disabled",
    stream: false,
    response_format: "url",
    output_format: "jpeg",
    watermark: false,
  } as const;
}

export function readSingleArkImage(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const data = Array.isArray((payload as { data?: unknown }).data)
    ? ((payload as { data: Array<Record<string, unknown>> }).data ?? [])
    : [];
  if (data.length !== 1) return null;
  const result = data[0];
  if (typeof result.url === "string" && result.url) return { kind: "url" as const, value: result.url };
  if (typeof result.b64_json === "string" && result.b64_json) {
    return { kind: "base64" as const, value: result.b64_json };
  }
  return null;
}
