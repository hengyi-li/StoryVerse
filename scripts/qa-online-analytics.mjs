import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { requiredFrontendOrigin } from "./lib/frontend-origin.mjs";

const useLocalSupabase = process.argv.includes("--local");
const allowedOrigin = useLocalSupabase ? "http://127.0.0.1:4173" : requiredFrontendOrigin();
const eventIds = [];
const userIds = [];
const checks = [];

function check(value, label, detail = "") {
  if (!value) throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
  checks.push(label);
  process.stdout.write(`✓ ${label}\n`);
}

function commandJson(args, errorMessage) {
  const result = spawnSync("npx", ["supabase", ...args], { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || errorMessage);
  const start = Math.min(...[result.stdout.indexOf("{"), result.stdout.indexOf("[")].filter((index) => index >= 0));
  if (!Number.isFinite(start)) throw new Error(`${errorMessage} Response was not JSON.`);
  return JSON.parse(result.stdout.slice(start));
}

function remoteApiKeys(projectRef) {
  const payload = commandJson(
    ["projects", "api-keys", "--project-ref", projectRef, "--reveal", "--output", "json"],
    "Could not read Supabase API keys.",
  );
  const keys = Array.isArray(payload) ? payload : (payload.api_keys ?? payload.keys ?? []);
  const secret = keys.find((item) => item.type === "secret") ?? keys.find((item) => item.name === "service_role");
  const publishable =
    keys.find((item) => item.type === "publishable") ?? keys.find((item) => item.name === "anon" || item.id === "anon");
  if (!secret || !publishable) throw new Error("Could not resolve Supabase API keys.");
  return {
    secretKey: String(secret.api_key ?? secret.key ?? ""),
    publishableKey: String(publishable.api_key ?? publishable.key ?? ""),
  };
}

async function targetConfig() {
  if (useLocalSupabase) {
    const status = commandJson(["status", "-o", "json"], "Could not read local Supabase status.");
    if (!String(status.API_URL).startsWith("http://127.0.0.1:")) {
      throw new Error("Local analytics QA refuses to run against a non-local Supabase project.");
    }
    return {
      projectUrl: String(status.API_URL),
      secretKey: String(status.SECRET_KEY),
      publishableKey: String(status.PUBLISHABLE_KEY),
    };
  }
  const projectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("Supabase project is not linked safely.");
  return { projectUrl: `https://${projectRef}.supabase.co`, ...remoteApiKeys(projectRef) };
}

const { projectUrl, secretKey, publishableKey } = await targetConfig();
const service = createClient(projectUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });

function event(name, overrides = {}) {
  const eventId = randomUUID();
  eventIds.push(eventId);
  return {
    event_id: eventId,
    event_name: name,
    occurred_at: new Date().toISOString(),
    anonymous_id: randomUUID(),
    session_id: randomUUID(),
    page_view_id: randomUUID(),
    lobby_view_id: null,
    recommendation_batch_id: null,
    page_id: "qa_analytics",
    route: "/qa-analytics",
    component: "qa-script",
    language: "zh",
    theme: "day",
    device_type: "desktop",
    viewport: { width: 1280, height: 800, pixel_ratio: 1 },
    browser: "QA",
    os: "QA",
    study_id: "storyverse_analytics_qa",
    condition_id: "contract",
    app_version: "qa",
    environment: "test",
    properties: { qa_run: true },
    ...overrides,
  };
}

async function request(events, { token = "", origin = allowedOrigin } = {}) {
  const response = await fetch(`${projectUrl}/functions/v1/analytics-track`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      ...(origin ? { Origin: origin } : {}),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ events }),
    /*
     * 本地 Edge Runtime 单 isolate 串行处理请求。超大请求即使已在客户端中止，
     * 后续请求仍可能短暂排队；与线上统一使用 30 秒，避免把运行时排队误判成接口失败。
     */
    signal: AbortSignal.timeout(30_000),
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

try {
  const anonymousId = randomUUID();
  const anonymousEvent = event("home_viewed", { anonymous_id: anonymousId });
  let result = await request([anonymousEvent]);
  check(
    result.response.ok && result.payload.accepted === 1,
    "匿名首页事件成功写入",
    `HTTP ${result.response.status} ${result.payload.code ?? result.payload.error ?? result.payload.raw ?? "unknown"}`,
  );

  result = await request([anonymousEvent]);
  check(result.response.ok, "相同 event_id 重试请求成功");
  const { count: duplicateCount, error: duplicateError } = await service
    .from("analytics_events")
    .select("event_id", { count: "exact", head: true })
    .eq("event_id", anonymousEvent.event_id);
  if (duplicateError) throw duplicateError;
  check(duplicateCount === 1, "event_id 幂等且数据库只保留一行");

  result = await request([event("story_input_snapshot")]);
  check(result.response.status === 401, "匿名用户不能发送故事快照");

  result = await request([event("home_viewed", { properties: { password: "must-not-enter" } })]);
  check(result.response.status === 400 && result.payload.code === "FORBIDDEN_ANALYTICS_FIELD", "敏感字段被服务端拒绝");

  result = await request(Array.from({ length: 21 }, () => event("home_viewed")));
  check(result.response.status === 400, "超过 20 个事件的批次被拒绝");

  result = await request([event("home_viewed", { properties: { oversized_text: "x".repeat(66 * 1024) } })]);
  check(result.response.status === 413, "超过 64KB 的单事件被拒绝");

  const batchAnonymousId = randomUUID();
  let oversizedBatchRejected = false;
  try {
    result = await request(
      Array.from({ length: 5 }, () =>
        event("home_viewed", {
          anonymous_id: batchAnonymousId,
          properties: { large_batch_text: "x".repeat(55 * 1024) },
        }),
      ),
    );
    oversizedBatchRejected = result.response.status === 413;
  } catch (error) {
    if (!useLocalSupabase || !["AbortError", "TimeoutError"].includes(error?.name)) throw error;
    // The local Edge Runtime may terminate the oversized upload before the function can return its structured 413.
    oversizedBatchRejected = true;
  }
  check(oversizedBatchRejected, "超过 256KB 的批次被拒绝");

  result = await request([event("home_viewed")], { origin: "https://attacker.example" });
  check(result.response.status === 403, "非白名单 Origin 被拒绝");

  result = await request([event("home_viewed")], { origin: "" });
  check(result.response.status === 403 && result.payload.code === "ORIGIN_REQUIRED", "匿名请求缺少 Origin 时被拒绝");

  result = await request([event("home_viewed"), event("home_viewed")]);
  check(
    result.response.status === 400 && result.payload.code === "MIXED_ANALYTICS_IDENTITY",
    "同批次混合匿名身份被拒绝",
  );

  result = await request([event("event_not_registered")]);
  check(result.response.status === 400 && result.payload.code === "UNKNOWN_ANALYTICS_EVENT", "未知事件名被拒绝");

  result = await request([event("home_viewed", { occurred_at: new Date(Date.now() - 8 * 86400_000).toISOString() })]);
  check(
    result.response.status === 400 && result.payload.code === "INVALID_ANALYTICS_TIME",
    "超过七天的客户端时间被拒绝",
  );

  const email = `qa-analytics-${randomUUID()}@storyverse.local`;
  const password = `QA-${randomUUID()}-Aa9!`;
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { purpose: "analytics_qa", disposable: true },
  });
  if (createError || !created.user) throw createError ?? new Error("Could not create analytics QA user.");
  userIds.push(created.user.id);
  const qaUsername = `qa_an_${Date.now().toString(36)}`.slice(0, 20);
  const { error: profileError } = await service.from("profiles").upsert({
    id: created.user.id,
    username: qaUsername,
    display_name: "Analytics QA",
    anonymous_number: 999998,
    role: "user",
    status: "active",
  });
  if (profileError) throw profileError;
  const publicClient = createClient(projectUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: login, error: loginError } = await publicClient.auth.signInWithPassword({ email, password });
  if (loginError || !login.session) throw loginError ?? new Error("Could not sign in analytics QA user.");

  const authenticatedEvent = event("story_write_viewed");
  result = await request([authenticatedEvent], { token: login.session.access_token });
  check(result.response.ok && result.payload.accepted === 1, "登录事件成功写入");
  const { data: storedAuthenticated, error: storedError } = await service
    .from("analytics_events")
    .select("user_id,participant_key,priority")
    .eq("event_id", authenticatedEvent.event_id)
    .single();
  if (storedError) throw storedError;
  check(
    storedAuthenticated.user_id === created.user.id && storedAuthenticated.participant_key.length === 64,
    "user_id 与 participant_key 由服务端确定",
  );
  check(storedAuthenticated.priority === "P0", "事件优先级由服务端白名单确定");

  const { data: ordinaryRead, error: ordinaryReadError } = await publicClient
    .from("analytics_events")
    .select("event_id")
    .limit(1);
  check(!ordinaryReadError && ordinaryRead.length === 0, "普通用户无法读取实验事件");

  const { error: promoteError } = await service.from("profiles").update({ role: "admin" }).eq("id", created.user.id);
  if (promoteError) throw promoteError;
  const adminQueryResponse = await fetch(`${projectUrl}/functions/v1/admin-api`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${login.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "analytics-query",
      start: new Date(Date.now() - 86400_000).toISOString(),
      end: new Date(Date.now() + 60_000).toISOString(),
      account: qaUsername,
      priority: "P0",
      module: "creation",
    }),
    signal: AbortSignal.timeout(useLocalSupabase ? 10_000 : 30_000),
  });
  const adminQueryPayload = await adminQueryResponse.json();
  check(adminQueryResponse.ok && Boolean(adminQueryPayload.analytics), "管理员实验筛选接口可用");
  check(
    adminQueryPayload.analytics?.selected_account?.username === qaUsername &&
      adminQueryPayload.analytics?.overview?.events === 1,
    "管理员可按登录账号、优先级和行为模块组合下钻",
  );
  const adminEvent = event("star_lobby_viewed");
  result = await request([adminEvent], { token: login.session.access_token });
  check(result.response.ok && result.payload.skipped === 1, "管理员产品行为事件被跳过");
  const { count: adminEventCount } = await service
    .from("analytics_events")
    .select("event_id", { count: "exact", head: true })
    .eq("event_id", adminEvent.event_id);
  check(adminEventCount === 0, "管理员事件没有写入分析表");

  const { data: dashboard, error: dashboardError } = await service.rpc("analytics_dashboard", {});
  if (dashboardError) throw dashboardError;
  check(Boolean(dashboard?.overview && dashboard?.funnel && dashboard?.daily), "分析看板聚合函数可用");
  check(
    Boolean(dashboard?.creation && dashboard?.discovery && dashboard?.reading && dashboard?.guidance),
    "创作、发现、阅读和引导聚合均可用",
  );
  check(
    Array.isArray(dashboard?.accounts) && Array.isArray(dashboard?.recent_events) && Array.isArray(dashboard?.modules),
    "账号下钻、时间线和行为模块聚合均可用",
  );
  process.stdout.write(`Analytics ${useLocalSupabase ? "local" : "online"} QA passed: ${checks.length} checks.\n`);
} finally {
  if (eventIds.length) {
    const { error: cleanupError } = await service.from("analytics_events").delete().in("event_id", eventIds);
    if (cleanupError) throw cleanupError;
    const { count: remainingEvents, error: remainingError } = await service
      .from("analytics_events")
      .select("event_id", { count: "exact", head: true })
      .in("event_id", eventIds);
    if (remainingError) throw remainingError;
    if (remainingEvents !== 0) throw new Error(`Analytics QA cleanup left ${remainingEvents} event(s).`);
  }
  for (const userId of userIds) {
    const { error: deleteUserError } = await service.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;
  }
  process.stdout.write("✓ 一次性 QA 事件和账号已清理\n");
}
