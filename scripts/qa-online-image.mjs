import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { imageDimensions } from "./lib/image-dimensions.mjs";
import { requiredFrontendOrigin } from "./lib/frontend-origin.mjs";

const PROJECT_REF = "zgyrbtdyraxglxhbkazp";
const projectUrl = `https://${PROJECT_REF}.supabase.co`;
const allowedOrigin = requiredFrontendOrigin();

function parseJsonOutput(output, commandName) {
  const objectStart = output.indexOf("{");
  const arrayStart = output.indexOf("[");
  const jsonStart = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  if (jsonStart < 0) throw new Error(`${commandName} did not return JSON.`);
  return JSON.parse(output.slice(jsonStart));
}

function apiKeys() {
  const result = spawnSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", PROJECT_REF, "--reveal", "--output", "json"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || "Could not read online Supabase API keys.");
  const payload = parseJsonOutput(result.stdout, "supabase projects api-keys");
  const keys = Array.isArray(payload) ? payload : (payload.api_keys ?? payload.keys ?? []);
  const secret = keys.find((item) => item.type === "secret") ?? keys.find((item) => item.name === "service_role");
  const publishable =
    keys.find((item) => item.type === "publishable") ?? keys.find((item) => item.name === "anon" || item.id === "anon");
  const secretKey = String(secret?.api_key ?? secret?.key ?? "");
  const publishableKey = String(publishable?.api_key ?? publishable?.key ?? "");
  if (!secretKey || !publishableKey) throw new Error("Could not resolve online Supabase API keys.");
  return { secretKey, publishableKey };
}

async function invoke(name, body, accessToken, publishableKey) {
  const response = await fetch(`${projectUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: allowedOrigin,
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${name} returned ${response.status}: ${payload.code ?? payload.error ?? "Unknown error"}`);
  }
  return payload;
}

const linkedProjectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
if (linkedProjectRef !== PROJECT_REF) {
  throw new Error(`Refusing online QA: linked project is ${linkedProjectRef || "missing"}.`);
}

const { secretKey, publishableKey } = apiKeys();
const service = createClient(projectUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const publicClient = createClient(projectUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const suffix = Date.now().toString(36).slice(-8);
const username = `qa_img_${suffix}`.slice(0, 20);
const email = `${username}@system.storyverse.invalid`;
const password = `QA-${randomUUID()}-Aa9!`;
let userId = "";

try {
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: "online_image_qa", disposable: true },
  });
  if (authError || !authData.user) throw authError ?? new Error("Could not create online QA user.");
  userId = authData.user.id;
  const { error: profileError } = await service.from("profiles").insert({
    id: userId,
    username,
    display_name: "图片 QA 测试账号",
    anonymous_number: 999001,
    role: "user",
    status: "active",
  });
  if (profileError) throw profileError;

  const storyBody =
    "这是一次隔离的线上图片测试故事。我是一名二十九岁的男性，傍晚时独自走到社区花园，看到志愿者正在收拾活动留下的桌椅。我加入他们，把散落的书和工具分门别类放回箱子。我们没有谈论宏大的目标，只是在天色变暗之前认真完成眼前的小事。离开时，花园恢复了安静，我也重新感受到普通合作带来的踏实与连接。这条记录会在测试结束后自动删除，不会进入真实用户的故事列表。";
  const { data: story, error: storyError } = await service
    .from("stories")
    .insert({
      user_id: userId,
      author_display_name: "图片 QA 测试账号",
      title: "二十九岁男生的社区花园傍晚",
      body: storyBody,
      excerpt: storyBody.slice(0, 70),
      mood: "平和自足",
      life_stage: "成年早期",
      age: 29,
      gender: "男",
      city: "上海",
      city_name_en: "Shanghai",
      city_country: "China",
      latitude: 31.2304,
      longitude: 121.4737,
      people: ["自己", "陌生人"],
      status: "published",
      moderation_decision: "pass",
      ai_type_id: "other_relationship",
      final_type_id: "other_relationship",
      ai_themes: ["社区互助", "日常连接"],
      final_themes: ["社区互助", "日常连接"],
      content_hash: `qa-online-image-${suffix}`,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (storyError) throw storyError;

  const { data: sessionData, error: sessionError } = await publicClient.auth.signInWithPassword({ email, password });
  if (sessionError || !sessionData.session) throw sessionError ?? new Error("Could not sign in online QA user.");
  const token = sessionData.session.access_token;
  const generationStartedAt = performance.now();
  const first = await invoke("story-generate-image", { storyId: story.id, style: "indie-zine" }, token, publishableKey);
  const totalGenerationDurationMs = Math.round(performance.now() - generationStartedAt);
  if (
    !Number.isFinite(first.generationDurationMs) ||
    first.generationDurationMs <= 0 ||
    totalGenerationDurationMs > 90_000
  ) {
    throw new Error(
      `Online image generation exceeded the acceptance budget: provider=${first.generationDurationMs ?? "missing"}ms total=${totalGenerationDurationMs}ms.`,
    );
  }
  for (const expected of [
    "故事标题：二十九岁男生的社区花园傍晚",
    "地点：上海，China",
    "叙事者当时的年龄：29 岁",
    "叙事者性别：男",
    "叙事者当时所处的人生阶段：成年早期",
    storyBody,
  ]) {
    if (!String(first.imagePrompt).includes(expected)) {
      throw new Error(`Online image prompt is missing required story context: ${expected}`);
    }
  }
  const repeated = await invoke(
    "story-generate-image",
    { storyId: story.id, style: "indie-zine" },
    token,
    publishableKey,
  );
  const changedStyle = await invoke(
    "story-generate-image",
    { storyId: story.id, style: "retro-collage" },
    token,
    publishableKey,
  );

  if (
    repeated.reused !== true ||
    changedStyle.reused !== true ||
    first.imageUrl !== repeated.imageUrl ||
    first.imageUrl !== changedStyle.imageUrl ||
    changedStyle.imageStyle !== "indie-zine"
  ) {
    throw new Error("Online repeated image requests did not reuse the selected image.");
  }
  if (!String(first.imageUrl).startsWith(`${projectUrl}/storage/v1/object/public/story-images/`)) {
    throw new Error("Online image URL does not use the public StoryVerse Supabase host.");
  }
  const response = await fetch(first.imageUrl);
  if (!response.ok) throw new Error(`Online image is not publicly readable (${response.status}).`);
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (!cacheControl.includes("max-age=31536000")) {
    throw new Error(`Online image does not use the expected one-year browser cache (${cacheControl || "missing"}).`);
  }
  const imageBytes = await response.arrayBuffer();
  const dimensions = imageDimensions(imageBytes);
  if (dimensions.width !== dimensions.height) {
    throw new Error(`Online image is not 1:1 (${dimensions.width}x${dimensions.height}).`);
  }
  const visualArtifact = "/private/tmp/storyverse-male-image-qa.png";
  await writeFile(visualArtifact, new Uint8Array(imageBytes));

  const [{ count: imageCount, error: imageCountError }, { count: attemptCount, error: attemptCountError }] =
    await Promise.all([
      service.from("generated_images").select("id", { count: "exact", head: true }).eq("story_id", story.id),
      service.from("image_generation_attempts").select("id", { count: "exact", head: true }).eq("story_id", story.id),
    ]);
  if (imageCountError || attemptCountError) throw imageCountError ?? attemptCountError;
  if (imageCount !== 1 || attemptCount !== 1) {
    throw new Error(`Online uniqueness failed: ${imageCount} image rows, ${attemptCount} model attempts.`);
  }

  const places = await invoke("places-search", { query: "上海", language: "zh" }, token, publishableKey);
  if (!Array.isArray(places.places)) throw new Error("Online places-search returned an invalid response.");

  process.stdout.write(
    `${JSON.stringify(
      {
        projectRef: PROJECT_REF,
        image: "stored-and-readable",
        dimensions: `${dimensions.width}x${dimensions.height}`,
        generatedImageRows: imageCount,
        modelAttemptsAfterThreeRequests: attemptCount,
        repeatedRequestsReused: true,
        providerDurationMs: first.generationDurationMs,
        totalGenerationDurationMs,
        browserCache: cacheControl,
        requiredPromptContext: "title-location-age-gender-stage-full-body",
        visualArtifact,
        placesSearch: places.degraded ? "local-fallback-ready" : "online",
      },
      null,
      2,
    )}\n`,
  );
} finally {
  if (userId) {
    const { data: images } = await service.from("generated_images").select("storage_path").eq("user_id", userId);
    const paths = (images ?? []).map((image) => image.storage_path).filter(Boolean);
    if (paths.length) await service.storage.from("story-images").remove(paths);
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) process.stderr.write(`Online QA cleanup warning: ${error.message}\n`);
  }
}
