import { verifySecret } from "../_shared/crypto.ts";
import { ApiError, json, serve } from "../_shared/http.ts";
import { processStoryImageJob, type StoryImageJobMessage } from "../_shared/story-image-job.ts";
import { adminClient } from "../_shared/supabase.ts";

type EdgeRuntimeApi = { waitUntil(promise: Promise<unknown>): void };

serve(async (request) => {
  if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed");
  const expectedToken = Deno.env.get("STORYVERSE_WORKER_TOKEN") ?? "";
  const actualToken = request.headers.get("x-storyverse-worker-token") ?? "";
  if (!(await verifySecret(actualToken, expectedToken))) {
    throw new ApiError(401, "WORKER_TOKEN_REQUIRED", "Worker token required");
  }

  const admin = adminClient();
  const { data, error } = await admin.rpc("claim_story_image_job");
  if (error) throw error;
  const claimed = Array.isArray(data) ? data[0] : data;
  if (!claimed) return json(request, { processed: false });

  const messageId = Number(claimed.msg_id);
  const message = claimed.message as StoryImageJobMessage;
  const task = processStoryImageJob(admin, messageId, message).catch((taskError) => {
    console.error(
      JSON.stringify({
        event: "story_image_worker_unhandled_error",
        messageId,
        error: taskError instanceof Error ? taskError.message : String(taskError),
      }),
    );
  });
  const edgeRuntime = (globalThis as typeof globalThis & { EdgeRuntime?: EdgeRuntimeApi }).EdgeRuntime;
  if (edgeRuntime) edgeRuntime.waitUntil(task);
  else await task;

  return json(
    request,
    {
      processed: true,
      accepted: true,
      messageId,
      storyId: String(message?.story_id ?? ""),
      retryCount: Math.max(0, Number(message?.retry_count) || 0),
    },
    202,
  );
});
