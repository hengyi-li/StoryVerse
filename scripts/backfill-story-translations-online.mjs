import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { requiredFrontendOrigin } from "./lib/frontend-origin.mjs";

const projectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
const confirmation = `backfill-story-translations-${projectRef}`;
const projectUrl = `https://${projectRef}.supabase.co`;
const promptVersion = "storyverse-story-translation-v2";
const frontendOrigin = requiredFrontendOrigin();

function parseJsonOutput(output, commandName) {
  const starts = [output.indexOf("{"), output.indexOf("[")].filter((index) => index >= 0);
  if (!starts.length) throw new Error(`${commandName} did not return JSON.`);
  return JSON.parse(output.slice(Math.min(...starts)));
}

function projectKeys() {
  const result = spawnSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", projectRef, "--reveal", "--output", "json"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "1" },
    },
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

function detectStoryLanguage(body) {
  const cjkCharacters = (String(body).match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWords = (String(body).match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length;
  if (!cjkCharacters && latinWords) return "en";
  if (!latinWords && cjkCharacters) return "zh";
  return cjkCharacters >= latinWords ? "zh" : "en";
}

async function callTranslation(publishableKey, accessToken, storyIds) {
  const response = await fetch(`${projectUrl}/functions/v1/story-translate`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: frontendOrigin,
    },
    body: JSON.stringify({ storyIds, targetLanguage: "zh" }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`story-translate returned ${response.status}: ${payload.code ?? payload.error ?? "Unknown error"}`);
  }
  const translatedIds = Object.keys(payload.translations ?? {});
  if (translatedIds.length !== storyIds.length) throw new Error("story-translate returned an incomplete batch.");
}

const { secretKey, publishableKey } = projectKeys();
const service = createClient(projectUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: stories, error: storyError } = await service.from("stories").select("id,body").order("created_at");
if (storyError) throw storyError;
const englishStoryIds = (stories ?? [])
  .filter((story) => detectStoryLanguage(story.body) === "en")
  .map((story) => String(story.id));
const { data: existingRows, error: existingError } = englishStoryIds.length
  ? await service
      .from("story_translations")
      .select("story_id,prompt_version")
      .in("story_id", englishStoryIds)
      .eq("target_language", "zh")
  : { data: [], error: null };
if (existingError) throw existingError;
const currentCachedIds = new Set(
  (existingRows ?? []).filter((row) => row.prompt_version === promptVersion).map((row) => String(row.story_id)),
);
const missingIds = englishStoryIds.filter((storyId) => !currentCachedIds.has(storyId));

process.stdout.write(
  `${JSON.stringify({ projectRef, stories: stories?.length ?? 0, englishStories: englishStoryIds.length, cachedChinese: currentCachedIds.size, missingChinese: missingIds.length })}\n`,
);
if (!missingIds.length) process.exit(0);
if (process.env.STORYVERSE_TRANSLATION_BACKFILL !== confirmation) {
  process.stdout.write(`Set STORYVERSE_TRANSLATION_BACKFILL=${confirmation} to write the missing Chinese caches.\n`);
  process.exit(0);
}

const suffix = Date.now().toString(36).slice(-8);
const username = `qa_tr_${suffix}`.slice(0, 20);
const email = `${username}@system.storyverse.invalid`;
const password = `QA-${randomUUID()}-Aa9!`;
let userId = "";

try {
  const { data: authData, error: authError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: "story_translation_backfill", disposable: true },
  });
  if (authError || !authData.user) throw authError ?? new Error("Could not create translation backfill user.");
  userId = authData.user.id;
  const { data: maxProfile, error: maxProfileError } = await service
    .from("profiles")
    .select("anonymous_number")
    .order("anonymous_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxProfileError) throw maxProfileError;
  const { error: profileError } = await service.from("profiles").insert({
    id: userId,
    username,
    display_name: "翻译回填临时账号",
    anonymous_number: Number(maxProfile?.anonymous_number ?? 0) + 1,
    role: "admin",
    status: "active",
  });
  if (profileError) throw profileError;
  const publicClient = createClient(projectUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: login, error: loginError } = await publicClient.auth.signInWithPassword({ email, password });
  if (loginError || !login.session) throw loginError ?? new Error("Could not sign in translation backfill user.");

  for (let index = 0; index < missingIds.length; index += 5) {
    await callTranslation(publishableKey, login.session.access_token, missingIds.slice(index, index + 5));
  }

  const { count, error: verifyError } = await service
    .from("story_translations")
    .select("story_id", { count: "exact", head: true })
    .in("story_id", englishStoryIds)
    .eq("target_language", "zh")
    .eq("prompt_version", promptVersion);
  if (verifyError) throw verifyError;
  if (count !== englishStoryIds.length) {
    throw new Error(`Backfill verification failed: expected ${englishStoryIds.length}, found ${count ?? 0}.`);
  }
  process.stdout.write(`${JSON.stringify({ translated: missingIds.length, verifiedChineseCaches: count })}\n`);
} finally {
  if (userId) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) process.stderr.write(`Could not remove translation backfill user: ${error.message}\n`);
  }
}
