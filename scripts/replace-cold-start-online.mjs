import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { requiredFrontendOrigin } from "./lib/frontend-origin.mjs";

const PROJECT_REF = "zgyrbtdyraxglxhbkazp";
const CONFIRMATION = `replace-seed-${PROJECT_REF}`;
const RESUME_CONFIRMATION = `resume-seed-${PROJECT_REF}`;
const NEW_CSV = new URL("../docs/cold-start/storyverse-seed-stories.csv", import.meta.url);
const ONLINE_URL = `https://${PROJECT_REF}.supabase.co`;
const OPERATOR_USERNAME = "seed_import_operator";
const OPERATOR_EMAIL = "seed-import-operator@system.storyverse.invalid";
const frontendOrigin = requiredFrontendOrigin();

function parseJsonOutput(output, commandName) {
  const starts = [output.indexOf("{"), output.indexOf("[")].filter((index) => index >= 0);
  if (!starts.length) throw new Error(`${commandName} did not return JSON.`);
  return JSON.parse(output.slice(Math.min(...starts)));
}

function projectKeys() {
  const result = spawnSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", PROJECT_REF, "--reveal", "--output", "json"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || "Could not read Supabase API keys.");
  const payload = parseJsonOutput(result.stdout, "supabase projects api-keys");
  const keys = Array.isArray(payload) ? payload : (payload.api_keys ?? payload.keys ?? []);
  const secret = keys.find((key) => key.type === "secret") ?? keys.find((key) => key.name === "service_role");
  const publishable =
    keys.find((key) => key.type === "publishable") ?? keys.find((key) => key.name === "anon" || key.id === "anon");
  const secretKey = String(secret?.api_key ?? secret?.key ?? "");
  const publishableKey = String(publishable?.api_key ?? publishable?.key ?? "");
  if (!secretKey || !publishableKey) throw new Error("Could not resolve Supabase API keys.");
  return { secretKey, publishableKey };
}

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function parseCsv(text) {
  const table = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) table.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  row.push(field);
  if (row.some((value) => value.trim())) table.push(row);
  const headers = (table.shift() ?? []).map((header) => header.replace(/^\ufeff/, "").trim());
  return table.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])),
  );
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

const linkedProjectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
if (linkedProjectRef !== PROJECT_REF) {
  throw new Error(`Refusing replacement: linked project is ${linkedProjectRef || "missing"}.`);
}
const [newRows, functionEnv] = await Promise.all([
  readFile(NEW_CSV, "utf8").then(parseCsv),
  readFile("supabase/functions/.env.local", "utf8").then(parseEnv),
]);
if (newRows.length !== 20) throw new Error(`Expected 20 replacement rows, received ${newRows.length}.`);
if (new Set(newRows.map((row) => row.external_id)).size !== 20) {
  throw new Error("Replacement external_id values are not unique.");
}
const workerToken = String(functionEnv.STORYVERSE_WORKER_TOKEN ?? "");
if (!workerToken) throw new Error("STORYVERSE_WORKER_TOKEN is missing from .env.local.");

const { secretKey, publishableKey } = projectKeys();
const service = createClient(ONLINE_URL, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const publicClient = createClient(ONLINE_URL, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const newIds = newRows.map((row) => row.external_id);
const replaceIds = [...new Set(newIds)];

const [{ data: targets, error: targetError }, { data: activeTasks, error: activeTaskError }] = await Promise.all([
  service.from("stories").select("id,external_id").eq("source_kind", "seed").in("external_id", replaceIds),
  service.from("ai_tasks").select("id,story_id,status").in("status", ["queued", "processing"]),
]);
if (targetError || activeTaskError) throw targetError ?? activeTaskError;
const resume = process.env.STORYVERSE_RESUME_SEED === RESUME_CONFIRMATION;
const targetIdSet = new Set(targets.map((story) => story.id));
if (activeTasks.length && (!resume || activeTasks.some((task) => !targetIdSet.has(task.story_id)))) {
  throw new Error(`Refusing replacement while ${activeTasks.length} unrelated AI task(s) are active.`);
}
if (resume && targets.length !== 20) {
  throw new Error(`Resume requires exactly 20 imported replacement stories; found ${targets.length}.`);
}
console.log(
  JSON.stringify({
    projectRef: PROJECT_REF,
    mode: resume ? "resume" : process.env.STORYVERSE_REPLACE_SEED === CONFIRMATION ? "replace" : "preflight",
    newRows: newRows.length,
    databaseTargets: targets.length,
  }),
);
if (!resume && process.env.STORYVERSE_REPLACE_SEED !== CONFIRMATION) {
  console.log(`Set STORYVERSE_REPLACE_SEED=${CONFIRMATION} to perform the replacement.`);
  process.exit(0);
}

async function ensureOperator() {
  const password = `Online-${randomUUID()}-Aa9!`;
  const { data: existing, error: lookupError } = await service
    .from("profiles")
    .select("id")
    .eq("username", OPERATOR_USERNAME)
    .maybeSingle();
  if (lookupError) throw lookupError;
  let userId = existing?.id;
  if (userId) {
    const { error } = await service.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
  } else {
    const { data, error } = await service.auth.admin.createUser({
      email: OPERATOR_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { system_account: true, purpose: "seed_import" },
    });
    if (error || !data.user) throw error ?? new Error("Could not create import operator.");
    userId = data.user.id;
    const { error: profileError } = await service.from("profiles").insert({
      id: userId,
      username: OPERATOR_USERNAME,
      display_name: "StoryVerse 导入任务",
      anonymous_number: 101,
      role: "admin",
      status: "active",
    });
    if (profileError) throw profileError;
  }
  const { error: activateError } = await service
    .from("profiles")
    .update({ role: "admin", status: "active" })
    .eq("id", userId);
  if (activateError) throw activateError;
  const { data: login, error: loginError } = await publicClient.auth.signInWithPassword({
    email: OPERATOR_EMAIL,
    password,
  });
  if (loginError || !login.session) throw loginError ?? new Error("Could not sign in import operator.");
  return { userId, accessToken: login.session.access_token };
}

async function callAdmin(accessToken, body) {
  const response = await fetch(`${ONLINE_URL}/functions/v1/admin-api`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: frontendOrigin,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`admin-api returned ${response.status}: ${payload.error ?? "Unknown error"}`);
  return payload;
}

async function runWorker() {
  const response = await fetch(`${ONLINE_URL}/functions/v1/story-analysis-worker`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
      "x-storyverse-worker-token": workerToken,
    },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`story-analysis-worker returned ${response.status}: ${payload.error ?? "Unknown error"}`);
  }
  return payload;
}

const operator = await ensureOperator();
try {
  if (resume) {
    console.log("[1/5] 保留已成功导入的 20 条冷启动记录。");
    console.log("[2/5] 跳过重复导入，从现有 AI 队列继续。");
  } else {
    const targetStoryIds = targets.map((story) => story.id);
    if (targetStoryIds.length) {
      const { error: cancelError } = await service
        .from("ai_tasks")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .in("story_id", targetStoryIds)
        .in("status", ["queued", "processing"]);
      if (cancelError) throw cancelError;
      const { error: deleteError } = await service.from("stories").delete().in("id", targetStoryIds);
      if (deleteError) throw deleteError;
    }
    const { error: batchDeleteError } = await service
      .from("import_batches")
      .delete()
      .eq("filename", "StoryVerse_seed_integrated_20_import_ready.csv");
    if (batchDeleteError) throw batchDeleteError;
    console.log(`[1/5] 已清理 ${targetStoryIds.length} 条旧冷启动记录。`);

    const imported = await callAdmin(operator.accessToken, {
      action: "seed-import",
      filename: "StoryVerse_seed_integrated_20_import_ready.csv",
      rows: newRows,
    });
    console.log(`[2/5] 导入新增 ${imported.imported} 条，失败 ${imported.failed} 条。`);
    if (imported.imported !== 20 || imported.failed !== 0) {
      throw new Error(`Unexpected import result: ${JSON.stringify(imported)}`);
    }
  }

  const { data: importedStories, error: importedStoryError } = await service
    .from("stories")
    .select("id,external_id,status")
    .eq("source_kind", "seed")
    .in("external_id", newIds);
  if (importedStoryError) throw importedStoryError;
  const importedStoryIds = new Set(importedStories.map((story) => story.id));
  if (resume) {
    const pendingStoryIds = importedStories
      .filter((story) => story.status === "pending_review")
      .map((story) => story.id);
    const { data: failedTasks, error: failedTaskError } = pendingStoryIds.length
      ? await service
          .from("ai_tasks")
          .select("id,story_id,created_at")
          .in("story_id", pendingStoryIds)
          .eq("status", "failed")
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (failedTaskError) throw failedTaskError;
    const latestFailedTask = new Map();
    for (const task of failedTasks) {
      if (!latestFailedTask.has(task.story_id)) latestFailedTask.set(task.story_id, task);
    }
    let retryIndex = 0;
    for (const [storyId, task] of latestFailedTask) {
      retryIndex += 1;
      console.log(`[retry ${retryIndex}/${latestFailedTask.size}] ${storyId}`);
      await callAdmin(operator.accessToken, { action: "task-retry", taskId: task.id });
    }
  }
  let processed = 0;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = await runWorker();
    if (!result.processed) break;
    if (result.storyId && !importedStoryIds.has(result.storyId)) {
      throw new Error(`Worker claimed an out-of-scope story: ${result.storyId}`);
    }
    processed += 1;
    console.log(`[AI ${String(processed).padStart(2, "0")}/20] ${result.storyId ?? result.skipped ?? "processed"}`);
  }
  console.log(`[3/5] AI 队列已处理 ${processed} 条。`);

  const { data: analyzedStories, error: analyzedError } = await service
    .from("stories")
    .select("id,external_id,status,moderation_decision,final_type_id,final_themes,body")
    .eq("source_kind", "seed")
    .in("external_id", newIds);
  if (analyzedError) throw analyzedError;
  const passed = analyzedStories.filter(
    (story) =>
      story.status === "needs_confirmation" &&
      story.moderation_decision === "pass" &&
      story.final_type_id &&
      Array.isArray(story.final_themes) &&
      story.final_themes.length === 2,
  );
  for (const story of passed) {
    await callAdmin(operator.accessToken, { action: "story-status", storyId: story.id, status: "published" });
  }
  console.log(`[4/5] 已发布 ${passed.length} 条机审通过故事；其他故事保留人工复核。`);

  const { data: finalStories, error: finalError } = await service
    .from("stories")
    .select("id,external_id,status,final_type_id,final_themes,body")
    .eq("source_kind", "seed")
    .in("external_id", newIds)
    .order("external_id");
  if (finalError) throw finalError;
  const finalIds = finalStories.map((story) => story.id);
  const { count: embeddings, error: embeddingError } = await service
    .from("story_embeddings")
    .select("story_id", { count: "exact", head: true })
    .in("story_id", finalIds);
  if (embeddingError) throw embeddingError;
  const rowByExternalId = new Map(newRows.map((row) => [row.external_id, row]));
  const bodyHashMatches = finalStories.filter(
    (story) => sha256(story.body) === sha256(rowByExternalId.get(story.external_id)?.body ?? ""),
  ).length;
  const statusCounts = Object.groupBy(finalStories, (story) => story.status);
  const validation = {
    stories: finalStories.length,
    bodyHashMatches,
    embeddings: embeddings ?? 0,
    validLabels: finalStories.filter(
      (story) => story.final_type_id && Array.isArray(story.final_themes) && story.final_themes.length === 2,
    ).length,
    statusCounts: Object.fromEntries(Object.entries(statusCounts).map(([status, items]) => [status, items.length])),
  };
  if (validation.stories !== 20 || validation.bodyHashMatches !== 20) {
    throw new Error(`Final validation failed: ${JSON.stringify(validation)}`);
  }
  console.log(`[5/5] ${JSON.stringify(validation)}`);
} finally {
  await service.from("profiles").update({ role: "user", status: "suspended" }).eq("id", operator.userId);
}
