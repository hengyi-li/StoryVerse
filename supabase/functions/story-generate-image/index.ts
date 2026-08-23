import { arkModelInfo } from "../_shared/ark.ts";
import { sha256 } from "../_shared/crypto.ts";
import { ApiError, json, readJson, serve } from "../_shared/http.ts";
import { buildStoryImagePrompt } from "../_shared/image-prompt.ts";
import { wakeStoryImageWorker } from "../_shared/story-image-worker-wakeup.ts";
import { storyPayload } from "../_shared/story-data.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

const styles = new Set(["clay-3d", "indie-zine", "retro-collage"]);

type EdgeRuntimeApi = { waitUntil(promise: Promise<unknown>): void };

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

function wakeImageWorkerInBackground() {
  const task = wakeStoryImageWorker().catch((error) => {
    console.error(
      JSON.stringify({
        event: "story_image_worker_wakeup_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
  const edgeRuntime = (globalThis as typeof globalThis & { EdgeRuntime?: EdgeRuntimeApi }).EdgeRuntime;
  if (edgeRuntime) edgeRuntime.waitUntil(task);
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
  if (story.moderation_decision !== "pass") {
    throw new ApiError(409, "IMAGE_BLOCKED", "这篇故事正在等待内容确认，确认完成后即可生成图片。");
  }

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
      status: "ready",
      imageUrl: claim.imageUrl,
      imageStyle: claim.style,
      highlight: claim.highlight,
      imagePrompt: claim.prompt,
      reused: true,
      story: storyPayload({ ...story, visual_status: "ready", image_url: claim.imageUrl }),
    });
  }
  if (claim.outcome === "rate_limited") {
    throw new ApiError(429, "IMAGE_RATE_LIMIT", "每小时最多生成 5 张图片，请稍后再试。");
  }
  if (claim.outcome === "generating") {
    wakeImageWorkerInBackground();
    return json(
      request,
      {
        status: "generating",
        queued: true,
        retryAfterMs: 2_500,
        imageStyle: input.style,
        highlight,
        imagePrompt: prompt,
        story: storyPayload({ ...story, visual_status: "generating" }),
      },
      202,
    );
  }
  if (claim.outcome !== "claimed" || !claim.imageId || !claim.attemptId) {
    throw new Error("Image generation claim returned an invalid result.");
  }

  const { error: queueError } = await admin.rpc("queue_story_image_job", {
    p_story_id: story.id,
    p_image_id: claim.imageId,
    p_attempt_id: claim.attemptId,
  });
  if (queueError) {
    const completedAt = new Date().toISOString();
    await admin.rpc("fail_story_image_job", {
      p_story_id: story.id,
      p_image_id: claim.imageId,
      p_attempt_id: claim.attemptId,
      p_error: queueError.message,
      p_completed_at: completedAt,
    });
    throw queueError;
  }
  const { error: storyVisualError } = await admin
    .from("stories")
    .update({ visual_status: "generating" })
    .eq("id", story.id);
  if (storyVisualError) throw storyVisualError;
  wakeImageWorkerInBackground();
  return json(
    request,
    {
      status: "generating",
      queued: true,
      retryAfterMs: 2_500,
      imageStyle: input.style,
      highlight,
      imagePrompt: prompt,
      story: storyPayload({ ...story, visual_status: "generating" }),
    },
    202,
  );
});
