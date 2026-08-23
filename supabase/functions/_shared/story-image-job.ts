import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createImageWithArk } from "./ark.ts";
import {
  shouldRetryImageGeneration,
  STORY_IMAGE_ATTEMPT_TIMEOUT_MS,
  STORY_IMAGE_RETRY_DELAY_SECONDS,
} from "./image-worker-policy.ts";
import { buildStoryImageFallbackPrompt } from "./image-prompt.ts";
import { wakeStoryImageWorker } from "./story-image-worker-wakeup.ts";

export type StoryImageJobMessage = {
  story_id: string;
  image_id: string;
  attempt_id: string;
  retry_count: number;
};

function bytesFromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

function publicStorageUrl(storagePath: string) {
  const configuredUrl = Deno.env.get("STORYVERSE_PUBLIC_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL");
  if (!configuredUrl) throw new Error("Public Supabase URL is not configured");
  const encodedPath = storagePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${configuredUrl.replace(/\/$/, "")}/storage/v1/object/public/story-images/${encodedPath}`;
}

async function archive(admin: SupabaseClient, messageId: number) {
  const { error } = await admin.rpc("archive_story_image_job", { p_msg_id: messageId });
  if (error) throw error;
}

async function archiveBestEffort(admin: SupabaseClient, messageId: number, event: string) {
  try {
    await archive(admin, messageId);
  } catch (error) {
    // Queue redelivery is safe: terminal rows are stale and active rows use an
    // attempt-specific Storage path.
    console.error(JSON.stringify({ event, messageId, error: errorMessage(error) }));
  }
}

async function downloadGeneratedImage(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Could not download generated image (${response.status})`);
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType: response.headers.get("content-type")?.split(";")[0] || "image/png",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function processStoryImageJob(admin: SupabaseClient, messageId: number, message: StoryImageJobMessage) {
  const storyId = String(message.story_id ?? "");
  const imageId = String(message.image_id ?? "");
  const attemptId = String(message.attempt_id ?? "");
  const retryCount = Math.max(0, Number(message.retry_count) || 0);
  if (!storyId || !imageId || !attemptId) {
    await archiveBestEffort(admin, messageId, "story_image_invalid_archive_failed");
    return { outcome: "skipped", reason: "invalid_message" } as const;
  }

  const [{ data: story, error: storyError }, { data: image, error: imageError }] = await Promise.all([
    admin.from("stories").select("*").eq("id", storyId).maybeSingle(),
    admin.from("generated_images").select("*").eq("id", imageId).eq("story_id", storyId).maybeSingle(),
  ]);
  if (storyError || imageError) throw storyError ?? imageError;
  if (!story || !image || image.status !== "generating" || String(image.active_attempt_id ?? "") !== attemptId) {
    await archiveBestEffort(admin, messageId, "story_image_stale_archive_failed");
    return { outcome: "skipped", reason: "stale_message" } as const;
  }

  const prompt = String(image.prompt);
  const style = String(image.style);
  const fallbackPrompt = buildStoryImageFallbackPrompt(story as Record<string, unknown>);
  let uploadedStoragePath = "";
  const startedAt = performance.now();
  try {
    const generated = await createImageWithArk({
      prompt,
      fallbackPrompt,
      style,
      timeoutMs: STORY_IMAGE_ATTEMPT_TIMEOUT_MS,
    });
    const actualPrompt = generated.usedFallback ? fallbackPrompt : prompt;
    let bytes: Uint8Array;
    let contentType = "image/png";
    if (generated.kind === "url") {
      const downloaded = await downloadGeneratedImage(generated.value);
      bytes = downloaded.bytes;
      contentType = downloaded.contentType;
    } else {
      bytes = bytesFromBase64(generated.value);
    }
    const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
    uploadedStoragePath = `${image.user_id}/${storyId}/${imageId}-${attemptId}.${extension}`;
    const { error: uploadError } = await admin.storage.from("story-images").upload(uploadedStoragePath, bytes, {
      contentType,
      cacheControl: "31536000",
      // Queue delivery is at-least-once. Reusing the same attempt-specific path
      // makes a delivery idempotent without touching a newer attempt's file.
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const imageUrl = publicStorageUrl(uploadedStoragePath);
    const completedAt = new Date().toISOString();
    const { data: completed, error: completionError } = await admin.rpc("complete_story_image_job", {
      p_story_id: storyId,
      p_image_id: imageId,
      p_attempt_id: attemptId,
      p_prompt: actualPrompt,
      p_storage_path: uploadedStoragePath,
      p_public_url: imageUrl,
      p_completed_at: completedAt,
    });
    if (completionError) {
      // A network error can happen after Postgres has committed. Confirm the
      // row before deleting the uploaded object so a successful image never
      // ends up pointing at a removed file.
      const { data: settledImage } = await admin
        .from("generated_images")
        .select("status,storage_path,public_url")
        .eq("id", imageId)
        .eq("active_attempt_id", attemptId)
        .maybeSingle();
      if (
        settledImage?.status === "ready" &&
        settledImage.storage_path === uploadedStoragePath &&
        settledImage.public_url === imageUrl
      ) {
        uploadedStoragePath = "";
        await archiveBestEffort(admin, messageId, "story_image_success_archive_failed");
        return { outcome: "ready", imageUrl, retryCount } as const;
      }
      throw completionError;
    }
    if (!completed) {
      await admin.storage.from("story-images").remove([uploadedStoragePath]);
      uploadedStoragePath = "";
      await archiveBestEffort(admin, messageId, "story_image_superseded_archive_failed");
      return { outcome: "skipped", reason: "superseded_after_generation" } as const;
    }
    uploadedStoragePath = "";
    await archiveBestEffort(admin, messageId, "story_image_success_archive_failed");
    console.info(
      JSON.stringify({
        event: "story_image_job_succeeded",
        storyId,
        imageId,
        retryCount,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    );
    return { outcome: "ready", imageUrl, retryCount } as const;
  } catch (error) {
    if (uploadedStoragePath) await admin.storage.from("story-images").remove([uploadedStoragePath]);
    const messageText = errorMessage(error);
    if (shouldRetryImageGeneration(error, retryCount)) {
      const nextMessage: StoryImageJobMessage = { ...message, retry_count: retryCount + 1 };
      const [{ error: imageRetryError }, { error: attemptRetryError }] = await Promise.all([
        admin
          .from("generated_images")
          .update({ error: `Automatic retry ${retryCount + 1}: ${messageText}` })
          .eq("id", imageId)
          .eq("active_attempt_id", attemptId)
          .eq("status", "generating"),
        admin
          .from("image_generation_attempts")
          .update({ error: `Automatic retry ${retryCount + 1}: ${messageText}` })
          .eq("id", attemptId),
      ]);
      if (imageRetryError || attemptRetryError) throw imageRetryError ?? attemptRetryError;
      const { error: retryError } = await admin.rpc("retry_story_image_job", {
        p_msg_id: messageId,
        p_message: nextMessage,
        p_delay_seconds: STORY_IMAGE_RETRY_DELAY_SECONDS,
      });
      if (retryError) throw retryError;
      console.warn(
        JSON.stringify({
          event: "story_image_job_retry_scheduled",
          storyId,
          imageId,
          retryCount: retryCount + 1,
          error: messageText,
        }),
      );
      // The delayed message must be claimed even when pg_cron is temporarily
      // unavailable. This task is itself retained by EdgeRuntime.waitUntil.
      await new Promise((resolve) => setTimeout(resolve, (STORY_IMAGE_RETRY_DELAY_SECONDS + 1) * 1_000));
      await wakeStoryImageWorker().catch((wakeError) => {
        console.error(
          JSON.stringify({
            event: "story_image_retry_wakeup_failed",
            storyId,
            imageId,
            error: errorMessage(wakeError),
          }),
        );
      });
      return { outcome: "retrying", retryCount: retryCount + 1 } as const;
    }

    const completedAt = new Date().toISOString();
    const { error: failureError } = await admin.rpc("fail_story_image_job", {
      p_story_id: storyId,
      p_image_id: imageId,
      p_attempt_id: attemptId,
      p_error: messageText,
      p_completed_at: completedAt,
    });
    if (failureError) throw failureError;
    await archiveBestEffort(admin, messageId, "story_image_failure_archive_failed");
    console.error(
      JSON.stringify({ event: "story_image_job_failed", storyId, imageId, retryCount, error: messageText }),
    );
    return { outcome: "failed", error: messageText } as const;
  }
}
