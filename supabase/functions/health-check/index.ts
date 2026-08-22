import { ApiError, json, serve } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

serve(async (request) => {
  if (request.method !== "GET") throw new ApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");

  const expectedToken = Deno.env.get("STORYVERSE_MONITOR_TOKEN") ?? "";
  const suppliedToken = request.headers.get("x-storyverse-monitor-token") ?? "";
  if (!expectedToken || expectedToken.length < 32 || suppliedToken !== expectedToken) {
    throw new ApiError(401, "MONITOR_AUTH_REQUIRED", "Monitor authentication required.");
  }

  const startedAt = performance.now();
  const { error } = await adminClient().from("story_types").select("id", { head: true, count: "exact" }).limit(1);
  if (error) throw error;

  return json(request, {
    status: "ok",
    database: "ok",
    databaseLatencyMs: Math.round(performance.now() - startedAt),
    region: Deno.env.get("SB_REGION") ?? "unknown",
    checkedAt: new Date().toISOString(),
  });
});
