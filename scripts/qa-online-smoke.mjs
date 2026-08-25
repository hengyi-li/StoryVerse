import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { requiredFrontendOrigin } from "./lib/frontend-origin.mjs";

const PROJECT_REF = "zgyrbtdyraxglxhbkazp";
const projectUrl = `https://${PROJECT_REF}.supabase.co`;
const allowedOrigin = requiredFrontendOrigin();
const textFunctionRegion = process.env.STORYVERSE_TEXT_FUNCTION_REGION ?? "ap-northeast-1";
const skipTranslation = process.env.STORYVERSE_SKIP_TRANSLATION === "1";
const tokyoTextFunctions = new Set(["story-analyze", "story-confirm", "story-translate"]);
const userIds = [];
const checks = [];

function check(condition, label, detail = "") {
  if (!condition) throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
  checks.push(label);
  process.stdout.write(`✓ ${label}${detail ? ` — ${detail}` : ""}\n`);
}

function parseJsonOutput(output, commandName) {
  const objectStart = output.indexOf("{");
  const arrayStart = output.indexOf("[");
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  if (start < 0) throw new Error(`${commandName} did not return JSON.`);
  return JSON.parse(output.slice(start));
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

async function request(name, { body, token, method = "POST", origin = allowedOrigin } = {}) {
  const headers = { apikey: publishableKey, Origin: origin };
  const endpoint = new URL(`${projectUrl}/functions/v1/${name}`);
  if (tokyoTextFunctions.has(name) && textFunctionRegion !== "any") {
    endpoint.searchParams.set("forceFunctionRegion", textFunctionRegion);
    headers["x-region"] = textFunctionRegion;
  }
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(endpoint, {
    method,
    headers,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  return { response, payload };
}

async function ok(name, options) {
  const result = await request(name, options);
  if (!result.response.ok) {
    throw new Error(`${name} returned ${result.response.status}: ${result.payload.code ?? result.payload.error}`);
  }
  return result.payload;
}

async function signup(accountIdentifier, displayName) {
  const password = `QA-${randomUUID()}-Aa9!`;
  const result = await ok("auth-signup", {
    token: publishableKey,
    body: {
      accountIdentifier,
      displayName,
      password,
      passwordConfirmation: password,
      securityQuestion: "first_school",
      securityAnswer: "线上测试学校",
    },
  });
  userIds.push(result.user.id);
  return { ...result, password };
}

const linkedProjectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
if (linkedProjectRef !== PROJECT_REF)
  throw new Error(`Refusing online QA: linked project is ${linkedProjectRef || "missing"}.`);

const { secretKey, publishableKey } = apiKeys();
const service = createClient(projectUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = Date.now().toString(36).slice(-7);
const draft = {
  guide: "",
  customGuide: "",
  title: "线上隔离回归故事",
  body: "这是一次隔离的线上回归测试。周末我参加了社区图书馆的整理活动，先把归还的书按编号放回书架，再和其他志愿者核对遗漏。刚开始我们彼此并不熟悉，但在一次次递书和确认中逐渐形成默契。活动结束时，阅览区重新变得整洁，负责人也记录了下一次可以改进的步骤。这段普通经历让我意识到，耐心合作和清楚沟通能让陌生人一起完成有意义的小事。测试完成后，这条故事和账号都会被自动删除。",
  mood: "平和自足",
  stage: "成年早期",
  age: "29",
  gender: "女",
  city: "上海",
  cityNameEn: "Shanghai",
  cityCountry: "China",
  cityLat: 31.2304,
  cityLon: 121.4737,
  people: ["自己", "陌生人"],
  startedAt: Date.now(),
  edits: 0,
  pastedChars: 0,
  saves: 0,
};

try {
  const allowedPreflight = await request("auth-login", { method: "OPTIONS", origin: allowedOrigin });
  const foreignPreflight = await request("auth-login", { method: "OPTIONS", origin: "https://attacker.example" });
  check(allowedPreflight.response.status === 204, "线上 CORS 预检成功");
  check(
    allowedPreflight.response.headers.get("access-control-allow-origin") === allowedOrigin,
    "线上允许正式站点 Origin",
  );
  check(
    foreignPreflight.response.headers.get("access-control-allow-origin") !== "https://attacker.example",
    "线上拒绝陌生 Origin 授权",
  );

  const invalidSignup = await request("auth-signup", {
    token: publishableKey,
    body: {
      accountIdentifier: `qa_bad_${suffix}`.slice(0, 20),
      displayName: "Online QA",
      password: "Online-QA-2026!",
      passwordConfirmation: "Online-QA-2026!",
      securityQuestion: "invented",
      securityAnswer: "答案足够长",
    },
  });
  check(
    invalidSignup.response.status === 400 && invalidSignup.payload.code === "INVALID_SECURITY_QUESTION",
    "线上注册密保白名单",
  );

  const usernameA = `qa_a_${suffix}`.slice(0, 20);
  const usernameB = `qa_b_${suffix}`.slice(0, 20);
  const userA = await signup(usernameA, "Online QA A");
  const userB = await signup(usernameB, "Online QA B");
  check(Boolean(userA.session.access_token && userB.session.access_token), "线上开放注册与会话", "2 个隔离账号");

  const duplicate = await request("auth-signup", {
    token: publishableKey,
    body: {
      accountIdentifier: usernameA.toUpperCase(),
      displayName: "Duplicate QA",
      password: "Online-QA-2026!",
      passwordConfirmation: "Online-QA-2026!",
      securityQuestion: "first_school",
      securityAnswer: "答案足够长",
    },
  });
  check(duplicate.response.status === 409 && duplicate.payload.code === "ACCOUNT_EXISTS", "线上账号大小写去重");

  const invalidCoordinates = await request("story-save-draft", {
    token: userA.session.access_token,
    body: { draft: { ...draft, cityLat: 91 } },
  });
  check(
    invalidCoordinates.response.status === 400 && invalidCoordinates.payload.code === "INVALID_COORDINATES",
    "线上经纬度边界",
  );

  const { error: genderConstraintError } = await service.from("story_drafts").insert({
    user_id: userA.user.id,
    gender: "not-a-gender",
  });
  check(genderConstraintError?.code === "23514", "线上数据库性别约束已生效");

  await ok("story-save-draft", { token: userA.session.access_token, body: { draft } });
  const clientB = createClient(projectUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${userB.session.access_token}` } },
  });
  const { data: foreignDrafts, error: foreignDraftError } = await clientB
    .from("story_drafts")
    .select("id")
    .eq("user_id", userA.user.id);
  if (foreignDraftError) throw foreignDraftError;
  check(foreignDrafts.length === 0, "线上草稿 RLS 跨用户隔离");

  const nonAdmin = await request("admin-api", { token: userA.session.access_token, body: { action: "dashboard" } });
  check(nonAdmin.response.status === 403 && nonAdmin.payload.code === "ADMIN_REQUIRED", "线上普通用户无法进入后台");

  const { data: featureFixture, error: featureFixtureError } = await service
    .from("stories")
    .insert({
      user_id: userA.user.id,
      author_display_name: "Online QA A",
      title: draft.title,
      body: draft.body,
      excerpt: draft.body.slice(0, 70),
      mood: draft.mood,
      life_stage: draft.stage,
      age: Number(draft.age),
      gender: draft.gender,
      city: draft.city,
      city_name_en: draft.cityNameEn,
      city_country: draft.cityCountry,
      latitude: draft.cityLat,
      longitude: draft.cityLon,
      people: draft.people,
      status: "published",
      moderation_decision: "pass",
      final_type_id: "career_achievement",
      final_themes: ["社区协作", "耐心沟通"],
      content_hash: `qa-online-feature-${suffix}`,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (featureFixtureError) throw featureFixtureError;

  const ownReaction = await request("reactions", {
    token: userA.session.access_token,
    body: { storyId: featureFixture.id, value: "like" },
  });
  check(
    ownReaction.response.status === 403 && ownReaction.payload.code === "SELF_REACTION_NOT_ALLOWED",
    "线上禁止点赞自己的故事",
  );

  const ownReport = await request("reports", {
    token: userA.session.access_token,
    body: { storyId: featureFixture.id, reason: "other", note: "QA self-report guard" },
  });
  check(
    ownReport.response.status === 403 && ownReport.payload.code === "SELF_REPORT_NOT_ALLOWED",
    "线上禁止举报自己的故事",
  );

  if (!skipTranslation) {
    const translationStartedAt = performance.now();
    const translated = await ok("story-translate", {
      token: userB.session.access_token,
      body: { storyIds: [featureFixture.id], targetLanguage: "en" },
    });
    const translationDurationMs = Math.round(performance.now() - translationStartedAt);
    const englishStory = translated.translations?.[featureFixture.id];
    check(
      translated.targetLanguage === "en" &&
        Boolean(englishStory?.title && englishStory?.body && englishStory?.city) &&
        englishStory.body !== draft.body &&
        !/\p{Script=Han}/u.test(englishStory.body),
      "线上中文故事完整翻译为英文",
      `${translationDurationMs}ms · ${textFunctionRegion}`,
    );

    const translatedAgain = await ok("story-translate", {
      token: userB.session.access_token,
      body: { storyIds: [featureFixture.id], targetLanguage: "en" },
    });
    check(
      translatedAgain.translations?.[featureFixture.id]?.translatedAt === englishStory.translatedAt,
      "线上重复翻译命中缓存",
    );
  } else {
    process.stdout.write("↷ 诊断模式跳过已知失败的线上故事翻译\n");
  }

  const analysisStartedAt = performance.now();
  const analyzed = await ok("story-analyze", { token: userA.session.access_token, body: { draft } });
  const analysisDurationMs = Math.round(performance.now() - analysisStartedAt);
  const [{ data: storyState }, { data: moderation }, { data: taskState }, { data: embeddingState }] = await Promise.all(
    [
      service
        .from("stories")
        .select("status,moderation_decision,moderation_categories,ai_prompt_version")
        .eq("id", analyzed.analysis.id)
        .single(),
      service
        .from("moderation_results")
        .select("decision,categories,reason,model,prompt_version")
        .eq("story_id", analyzed.analysis.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      service
        .from("ai_tasks")
        .select("status,attempts,last_error")
        .eq("story_id", analyzed.analysis.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      service
        .from("story_embeddings")
        .select("story_id,model_version")
        .eq("story_id", analyzed.analysis.id)
        .maybeSingle(),
    ],
  );
  if (
    analyzed.status !== "needs_confirmation" ||
    storyState?.ai_prompt_version === "storyverse-analysis-fail-open-v1" ||
    moderation?.prompt_version === "storyverse-analysis-fail-open-v1" ||
    Boolean(taskState?.last_error) ||
    !embeddingState
  ) {
    throw new Error(
      `线上真实 AI 审核、标签与向量: ${JSON.stringify({ responseStatus: analyzed.status, storyState, moderation, taskState, embeddingState })}`,
    );
  }
  check(true, "线上真实 AI 审核、标签与向量", `${analyzed.status} · ${analysisDurationMs}ms · ${textFunctionRegion}`);
  check(
    analyzed.analysis?.storyTags?.themes?.length === 2 && Boolean(analyzed.analysis?.storyTags?.eventType?.value),
    "线上 AI 返回单一类型与两个主题",
  );
  const confirmationStartedAt = performance.now();
  const confirmed = await ok("story-confirm", {
    token: userA.session.access_token,
    body: {
      storyId: analyzed.analysis.id,
      draft,
      typeId: analyzed.analysis.storyTags.eventType.value,
      themes: analyzed.analysis.storyTags.themes.map((theme) => theme.value),
      emotions: analyzed.analysis.storyTags.emotions ?? [],
    },
  });
  const confirmationDurationMs = Math.round(performance.now() - confirmationStartedAt);
  check(confirmed.status === "published", "线上故事确认并公开", `${confirmationDurationMs}ms · ${textFunctionRegion}`);

  const { data: publicStory, error: publicStoryError } = await clientB
    .from("stories")
    .select("id,status")
    .eq("id", analyzed.analysis.id)
    .maybeSingle();
  if (publicStoryError) throw publicStoryError;
  check(publicStory?.status === "published", "线上公开故事可被其他用户读取");

  const remotePlaces = await ok("places-search", {
    token: userA.session.access_token,
    body: { query: "Reykjavik", language: "en" },
  });
  check(
    Array.isArray(remotePlaces.places) &&
      remotePlaces.places.some(
        (place) =>
          place.lat != null &&
          place.lon != null &&
          Number.isFinite(Number(place.lat)) &&
          Number.isFinite(Number(place.lon)),
      ),
    "线上全球城市搜索返回真实经纬度",
  );

  const recommendations = await ok("recommendations-refresh", {
    token: userA.session.access_token,
    body: {},
  });
  check(Array.isArray(recommendations.recommendations), "线上推荐批次结构稳定");
  const lobby = await ok("lobby-stories", { token: userA.session.access_token, method: "GET" });
  check(Array.isArray(lobby.recommendations) && lobby.recommendations.length > 0, "线上星空大厅返回真实故事");
  const storiesWithoutCoordinates = lobby.recommendations
    .filter(
      (item) =>
        item.story?.latitude == null ||
        item.story?.longitude == null ||
        !Number.isFinite(Number(item.story.latitude)) ||
        !Number.isFinite(Number(item.story.longitude)),
    )
    .map((item) => ({
      id: item.story?.id ?? null,
      city: item.story?.city ?? null,
      latitude: item.story?.latitude ?? null,
      longitude: item.story?.longitude ?? null,
    }));
  check(
    storiesWithoutCoordinates.length === 0,
    "线上星空大厅故事保留真实经纬度",
    storiesWithoutCoordinates.length ? JSON.stringify(storiesWithoutCoordinates.slice(0, 5)) : "",
  );
  const notices = await ok("notifications", { token: userA.session.access_token, method: "GET" });
  check(Array.isArray(notices.notifications), "线上通知接口结构稳定");

  const { error: promoteError } = await service.from("profiles").update({ role: "admin" }).eq("id", userA.user.id);
  if (promoteError) throw promoteError;
  const adminDashboard = await ok("admin-api", { token: userA.session.access_token, body: { action: "dashboard" } });
  check(Array.isArray(adminDashboard.users) && Array.isArray(adminDashboard.stories), "线上管理员服务端角色验证");

  process.stdout.write(`Online smoke passed: ${checks.length} checks.\n`);
} finally {
  for (const userId of userIds) {
    const { data: images } = await service.from("generated_images").select("storage_path").eq("user_id", userId);
    const paths = (images ?? []).map((image) => image.storage_path).filter(Boolean);
    if (paths.length) await service.storage.from("story-images").remove(paths);
    await service.from("admin_audit_logs").delete().eq("admin_id", userId);
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) process.stderr.write(`Online QA cleanup warning for ${userId}: ${error.message}\n`);
  }
}
