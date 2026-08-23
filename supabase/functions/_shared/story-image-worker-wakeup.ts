const WAKE_TIMEOUT_MS = 5_000;

export async function wakeStoryImageWorker() {
  const baseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const workerToken = Deno.env.get("STORYVERSE_WORKER_TOKEN") ?? "";
  if (!baseUrl || !workerToken) throw new Error("Story image worker is not configured");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WAKE_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/functions/v1/story-image-worker`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-storyverse-worker-token": workerToken,
      },
      body: "{}",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Story image worker wake-up failed (${response.status})`);
  } finally {
    clearTimeout(timer);
  }
}
