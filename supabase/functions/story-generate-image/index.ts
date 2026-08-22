import { arkModelInfo, createImageWithArk } from "../_shared/ark.ts";
import { sha256 } from "../_shared/crypto.ts";
import { ApiError, json, readJson, serve } from "../_shared/http.ts";
import { buildStoryImageFallbackPrompt, buildStoryImagePrompt } from "../_shared/image-prompt.ts";
import { storyPayload } from "../_shared/story-data.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

const styles = new Set(["clay-3d", "indie-zine", "retro-collage"]);

type ImageClaim = {
  outcome: "claimed" | "ready" | "generating" | "rate_limited" | "stale";
  imageId?: string;
  attemptId?: string;
  imageUrl?: string;
  storagePath?: string;
  style?: string;
  highlight?: Record<string, unknown>;
  prompt?: string;
};

function bytesFromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function publicStorageUrl(request: Request, storagePath: string) {
  const encodedPath = storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const configuredUrl = Deno.env.get("STORYVERSE_PUBLIC_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  const requestOrigin = new URL(request.url).origin;
  const publicOrigin = configuredUrl && !configuredUrl.includes("//kong:") ? configuredUrl : requestOrigin;
  return `${publicOrigin.replace(/\/$/, "")}/storage/v1/object/public/story-images/${encodedPath}`;
}

serve(async (request) => {
  if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支持这个请求方式。");
  const { user } = await requireUser(request);
  const input = await readJson<{ storyId: string; style: string }>(request);
  if (!styles.has(input.style)) throw new ApiError(400, "INVALID_IMAGE_STYLE", "请选择有效的图片风格。");
  const admin = adminClient();
  const { data: story, error: storyError } = await admin
    .from("stories")
    .select("*")
    .eq("id", input.storyId)
    .eq("user_id", user.id)
    .single();
  if (storyError || !story) throw new ApiError(404, "STORY_NOT_FOUND", "没有找到这篇故事。");
  if (story.moderation_decision !== "pass")
    throw new ApiError(409, "IMAGE_BLOCKED", "这篇故事正在等待内容确认，确认完成后即可生成图片。");

  const sentence =
    String(story.body)
      .split(/[。！？.!?\n]/)
      .map((value) => value.trim())
      .find((value) => value.length >= 8) ?? String(story.body).slice(0, 100);
  const highlight = {
    title: story.title || story.ai_suggested_title || "我的故事",
    moment: sentence,
    scene: [story.city, story.life_stage].filter(Boolean).join(" · "),
    action: sentence,
    emotion: story.mood,
  };
  const prompt = buildStoryImagePrompt(story);
  const fallbackPrompt = buildStoryImageFallbackPrompt(story);
  const imageSourceHash = await sha256(`${story.content_hash}\u0000${prompt}`);
  const model = arkModelInfo().image;
  let claim: ImageClaim | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await admin.rpc("claim_story_image_generation", {
      p_story_id: story.id,
      p_user_id: user.id,
      p_style: input.style,
      p_prompt: prompt,
      p_highlight: highlight,
      p_model: model,
      p_source_content_hash: imageSourceHash,
    });
    if (error) throw error;
    claim = data as ImageClaim;
    if (claim.outcome !== "stale") break;
    if (claim.storagePath) await admin.storage.from("story-images").remove([claim.storagePath]);
    const { error: deleteError } = await admin.from("generated_images").delete().eq("id", claim.imageId);
    if (deleteError) throw deleteError;
  }
  if (!claim) throw new Error("Could not claim image generation.");
  if (claim.outcome === "ready") {
    return json(request, {
      imageUrl: claim.imageUrl,
      imageStyle: claim.style,
      highlight: claim.highlight,
      imagePrompt: claim.prompt,
      reused: true,
      story: storyPayload({ ...story, visual_status: "ready", image_url: claim.imageUrl }),
    });
  }
  if (claim.outcome === "generating") {
    throw new ApiError(409, "IMAGE_GENERATING", "这篇故事的图片正在生成，请稍后查看。");
  }
  if (claim.outcome === "rate_limited") {
    throw new ApiError(429, "IMAGE_RATE_LIMIT", "每小时最多生成 5 张图片，请稍后再试。");
  }
  if (claim.outcome !== "claimed" || !claim.imageId || !claim.attemptId) {
    throw new Error("Image generation claim returned an invalid result.");
  }

  const imageId = claim.imageId;
  const attemptId = claim.attemptId;
  let uploadedStoragePath: string | null = null;

  try {
    const generated = await createImageWithArk({ prompt, fallbackPrompt, style: input.style });
    const actualPrompt = generated.usedFallback ? fallbackPrompt : prompt;
    let bytes: Uint8Array;
    let contentType = "image/png";
    if (generated.kind === "url") {
      const response = await fetch(generated.value);
      if (!response.ok) throw new Error(`Could not download generated image (${response.status})`);
      bytes = new Uint8Array(await response.arrayBuffer());
      contentType = response.headers.get("content-type")?.split(";")[0] || contentType;
    } else {
      bytes = bytesFromBase64(generated.value);
    }
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
    const storagePath = `${user.id}/${story.id}/${imageId}.${extension}`;
    const { error: uploadError } = await admin.storage.from("story-images").upload(storagePath, bytes, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    uploadedStoragePath = storagePath;
    const imageUrl = publicStorageUrl(request, storagePath);
    const { error: imageUpdateError } = await admin
      .from("generated_images")
      .update({
        status: "ready",
        prompt: actualPrompt,
        storage_path: storagePath,
        public_url: imageUrl,
        completed_at: new Date().toISOString(),
      })
      .eq("id", imageId);
    if (imageUpdateError) throw imageUpdateError;
    const { error: storyUpdateError } = await admin
      .from("stories")
      .update({ visual_status: "ready" })
      .eq("id", story.id);
    if (storyUpdateError) throw storyUpdateError;
    const { error: attemptUpdateError } = await admin
      .from("image_generation_attempts")
      .update({ status: "succeeded", completed_at: new Date().toISOString() })
      .eq("id", attemptId);
    if (attemptUpdateError) throw attemptUpdateError;
    return json(request, {
      imageUrl,
      imageStyle: input.style,
      highlight,
      imagePrompt: prompt,
      generationDurationMs: generated.durationMs,
      story: storyPayload({ ...story, visual_status: "ready", image_url: imageUrl }),
    });
  } catch (error) {
    if (uploadedStoragePath) await admin.storage.from("story-images").remove([uploadedStoragePath]);
    const errorMessage = error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
    await admin
      .from("generated_images")
      .update({ status: "failed", error: errorMessage, storage_path: null, public_url: null })
      .eq("id", imageId);
    await admin
      .from("image_generation_attempts")
      .update({ status: "failed", error: errorMessage, completed_at: new Date().toISOString() })
      .eq("id", attemptId);
    await admin.from("stories").update({ visual_status: "failed" }).eq("id", story.id);
    throw error;
  }
});
