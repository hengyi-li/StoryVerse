import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function localSupabase() {
  const result = spawnSync("npx", ["supabase", "status", "-o", "json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Could not read local Supabase status: ${result.stderr.trim()}`);
  const start = result.stdout.indexOf("{");
  const status = JSON.parse(result.stdout.slice(start));
  if (!String(status.API_URL).startsWith("http://127.0.0.1:")) {
    throw new Error("Boundary QA refuses to run against a non-local Supabase project.");
  }
  return { url: status.API_URL, publishableKey: status.PUBLISHABLE_KEY, secretKey: status.SECRET_KEY };
}

const config = localSupabase();
const service = createClient(config.url, config.secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const origin = "http://127.0.0.1:4173";
const createdUserIds = [];
const createdStoryIds = [];
const createdImportBatchIds = [];
const createdConfigIds = [];
const checks = [];
const findings = [];

function check(condition, name, detail = "") {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  checks.push({ name, detail });
  process.stdout.write(`✓ ${name}${detail ? ` — ${detail}` : ""}\n`);
}

async function rawFunction(
  name,
  { method = "POST", body, token, requestOrigin = origin, contentType = "application/json" } = {},
) {
  const headers = { apikey: config.publishableKey, Origin: requestOrigin };
  if (token !== null) headers.Authorization = `Bearer ${token ?? config.publishableKey}`;
  if (contentType) headers["Content-Type"] = contentType;
  const response = await fetch(`${config.url}/functions/v1/${name}`, {
    method,
    headers,
    ...(body === undefined || method === "GET" || method === "HEAD" ? {} : { body }),
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

async function callFunction(name, body, token, method = "POST") {
  const result = await rawFunction(name, {
    method,
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    token,
  });
  if (!result.response.ok) {
    const error = new Error(`${name} returned ${result.response.status}: ${result.payload.error ?? "Unknown error"}`);
    error.status = result.response.status;
    error.code = result.payload.code;
    throw error;
  }
  return result;
}

async function expectError(name, body, code, token, method = "POST", status) {
  const result = await rawFunction(name, {
    method,
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    token,
  });
  check(!result.response.ok, `${name} 拒绝错误请求`, `${result.response.status}/${result.payload.code ?? "no-code"}`);
  if (code) check(result.payload.code === code, `${name} 返回预期错误码`, code);
  if (status) check(result.response.status === status, `${name} 返回预期 HTTP 状态`, String(status));
  check(!String(result.payload.error ?? "").includes(" at "), `${name} 不泄露堆栈`);
  return result;
}

async function signup(input) {
  const result = await callFunction("auth-signup", input, config.publishableKey);
  check(Boolean(result.payload.user?.id && result.payload.session?.access_token), "注册返回用户和会话");
  createdUserIds.push(result.payload.user.id);
  return result.payload;
}

const suffix = Date.now().toString(36).slice(-8);
const password = "StoryVerse-QA-2026!";
const validSignup = (accountIdentifier, displayName = "QA 用户") => ({
  accountIdentifier,
  displayName,
  password,
  passwordConfirmation: password,
  securityQuestion: "first_school",
  securityAnswer: "测试学校",
});
const storyBody =
  "搬到新的城市以后，我参加了社区图书馆的志愿活动。最初我只负责整理书架，后来逐渐认识了不同年龄的伙伴。大家会分享最近读到的书，也会耐心听我讲刚来这里时的不适应。几个月后，我已经能够主动帮助新加入的人熟悉环境。这个过程让我发现，归属感并不总是突然出现，它往往来自一次次普通的问候、合作和相互记住。";
const completeDraft = {
  guide: "",
  customGuide: "",
  title: "QA 边界故事",
  body: storyBody,
  age: "27",
  gender: "女",
  stage: "成年早期",
  city: "上海",
  cityLat: 31.2304,
  cityLon: 121.4737,
  cityNameEn: "Shanghai",
  cityCountry: "China",
  mood: "平和自足",
  people: ["自己", "朋友"],
};

let userA;
let userB;
let adminToken = "";

try {
  const functionNames = [
    "admin-api",
    "auth-change-password",
    "auth-login",
    "auth-recover",
    "auth-signup",
    "feedback",
    "lobby-stories",
    "notifications",
    "places-ip-hint",
    "places-search",
    "reactions",
    "recommendations-current",
    "recommendations-refresh",
    "reports",
    "story-analysis-worker",
    "story-image-worker",
    "story-analyze",
    "story-confirm",
    "story-generate-image",
    "story-save-draft",
    "story-translate",
  ];
  for (const name of functionNames) {
    const result = await rawFunction(name, { method: "PATCH", body: "{}" });
    check(result.response.status === 405, `${name} 拒绝错误 HTTP 方法`);
    check(result.payload.code === "METHOD_NOT_ALLOWED", `${name} 方法错误结构化`);
  }
  check(true, `${functionNames.length} 个 Edge Function 方法边界`, "全部实际请求");

  for (const name of functionNames) {
    const result = await rawFunction(name, { method: "OPTIONS", token: null });
    check(result.response.status === 204, `${name} OPTIONS 预检成功`);
    const allowedOrigin = result.response.headers.get("access-control-allow-origin");
    check(allowedOrigin === origin || allowedOrigin === "*", `${name} 返回 CORS 响应头`);
  }
  const foreignOrigin = "https://attacker.example";
  const blockedCors = await rawFunction("auth-login", { method: "OPTIONS", token: null, requestOrigin: foreignOrigin });
  const foreignAllowedOrigin = blockedCors.response.headers.get("access-control-allow-origin");
  if (foreignAllowedOrigin === "*") {
    findings.push("SEC-CORS: 本地 Supabase 网关将 Access-Control-Allow-Origin 覆盖为 *，应用白名单未生效。");
    process.stdout.write("! FINDING SEC-CORS — 本地 Supabase 网关允许任意 Origin 预检\n");
  } else {
    check(foreignAllowedOrigin !== foreignOrigin, "陌生 Origin 未获 CORS 授权");
  }

  const protectedFunctions = [
    "admin-api",
    "auth-change-password",
    "feedback",
    "lobby-stories",
    "notifications",
    "places-ip-hint",
    "places-search",
    "reactions",
    "recommendations-current",
    "recommendations-refresh",
    "reports",
    "story-analyze",
    "story-confirm",
    "story-generate-image",
    "story-save-draft",
    "story-translate",
  ];
  for (const name of protectedFunctions) {
    const result = await rawFunction(name, { body: "{}", token: null });
    check(result.response.status === 401, `${name} 无登录态拒绝访问`);
  }
  for (const [workerName, label] of [
    ["story-analysis-worker", "AI worker"],
    ["story-image-worker", "图片 worker"],
  ]) {
    const workerUnauthorized = await rawFunction(workerName, { body: "{}", token: null });
    check(
      workerUnauthorized.response.status === 401 && workerUnauthorized.payload.code === "WORKER_TOKEN_REQUIRED",
      `${label} 无内部令牌拒绝访问`,
    );
  }

  for (const [name, token] of [
    ["auth-signup", config.publishableKey],
    ["auth-login", config.publishableKey],
    ["auth-recover", config.publishableKey],
  ]) {
    const result = await rawFunction(name, { body: "{not-json", token });
    check(result.response.status === 400 && result.payload.code === "INVALID_JSON", `${name} 非法 JSON 被拒绝`);
  }

  const invalidSignups = [
    ["账号 3 位", { ...validSignup("abc") }, "INVALID_USERNAME"],
    ["账号 21 位", { ...validSignup("a".repeat(21)) }, "INVALID_USERNAME"],
    ["账号含空格", { ...validSignup("bad name") }, "INVALID_USERNAME"],
    ["账号含中文", { ...validSignup("中文账号") }, "INVALID_USERNAME"],
    [
      "密码 9 位",
      { ...validSignup(`p9_${suffix}`), password: "1".repeat(9), passwordConfirmation: "1".repeat(9) },
      "INVALID_PASSWORD",
    ],
    [
      "密码 73 位",
      { ...validSignup(`p73_${suffix}`), password: "1".repeat(73), passwordConfirmation: "1".repeat(73) },
      "INVALID_PASSWORD",
    ],
    ["确认密码不同", { ...validSignup(`mis_${suffix}`), passwordConfirmation: `${password}x` }, "PASSWORD_MISMATCH"],
    ["昵称为空", { ...validSignup(`dn0_${suffix}`), displayName: "   " }, "INVALID_DISPLAY_NAME"],
    ["昵称 41 字", { ...validSignup(`dn41_${suffix}`), displayName: "字".repeat(41) }, "INVALID_DISPLAY_NAME"],
    ["非法密保问题", { ...validSignup(`sq_${suffix}`), securityQuestion: "invented" }, "INVALID_SECURITY_QUESTION"],
    ["密保答案 1 字", { ...validSignup(`sa1_${suffix}`), securityAnswer: "a" }, "INVALID_SECURITY_ANSWER"],
    [
      "密保答案 81 字",
      { ...validSignup(`sa81_${suffix}`), securityAnswer: "字".repeat(81) },
      "INVALID_SECURITY_ANSWER",
    ],
  ];
  for (const [label, body, code] of invalidSignups) {
    const result = await rawFunction("auth-signup", { body: JSON.stringify(body), token: config.publishableKey });
    check(result.response.status === 400 && result.payload.code === code, label, code);
  }

  const minPasswordSignup = validSignup(`min_${suffix}`.slice(0, 20), "十位密码");
  minPasswordSignup.password = "1234567890";
  minPasswordSignup.passwordConfirmation = "1234567890";
  await signup(minPasswordSignup);
  const maxPasswordSignup = validSignup(`max_${suffix}`.slice(0, 20), "七十二位密码");
  maxPasswordSignup.password = "a".repeat(72);
  maxPasswordSignup.passwordConfirmation = "a".repeat(72);
  await signup(maxPasswordSignup);
  check(true, "密码 10/72 位边界均可注册");

  userA = await signup(validSignup(`qa_a_${suffix}`.slice(0, 20), "QA 用户 A"));
  userB = await signup(validSignup(`qa_b_${suffix}`.slice(0, 20), "QA 用户 B"));
  const exact20 = `q${suffix}${"x".repeat(20)}`.slice(0, 20);
  await signup(validSignup(exact20, "二十位账号"));
  check(exact20.length === 20, "账号 20 位边界可注册");

  const duplicateId = `dup_${suffix}`.slice(0, 20);
  const duplicateResults = await Promise.all([
    rawFunction("auth-signup", { body: JSON.stringify(validSignup(duplicateId)), token: config.publishableKey }),
    rawFunction("auth-signup", {
      body: JSON.stringify(validSignup(duplicateId.toUpperCase())),
      token: config.publishableKey,
    }),
  ]);
  const duplicateSuccesses = duplicateResults.filter((item) => item.response.status === 201);
  const duplicateConflicts = duplicateResults.filter(
    (item) => item.response.status === 409 && item.payload.code === "ACCOUNT_EXISTS",
  );
  createdUserIds.push(...duplicateSuccesses.map((item) => item.payload.user.id));
  check(duplicateSuccesses.length === 1 && duplicateConflicts.length === 1, "并发及大小写重复账号只能创建一个");

  const loginA = await callFunction(
    "auth-login",
    { accountIdentifier: ` ${userA.user.username.toUpperCase()} `, password },
    config.publishableKey,
  );
  check(Boolean(loginA.payload.session?.access_token), "账号大小写和首尾空格登录成功");
  const wrongAccount = await rawFunction("auth-login", {
    body: JSON.stringify({ accountIdentifier: `none_${suffix}`.slice(0, 20), password: "wrong-password" }),
    token: config.publishableKey,
  });
  const wrongPassword = await rawFunction("auth-login", {
    body: JSON.stringify({ accountIdentifier: userA.user.username, password: "wrong-password" }),
    token: config.publishableKey,
  });
  check(
    wrongAccount.response.status === 401 &&
      wrongPassword.response.status === 401 &&
      wrongAccount.payload.code === "INVALID_CREDENTIALS" &&
      wrongPassword.payload.code === "INVALID_CREDENTIALS" &&
      wrongAccount.payload.error === wrongPassword.payload.error,
    "不存在账号与错误密码使用统一提示",
  );

  const tokenA = userA.session.access_token;
  let tokenB = userB.session.access_token;
  const invalidJsonAuthenticated = [
    "auth-change-password",
    "feedback",
    "notifications",
    "places-search",
    "reactions",
    "reports",
    "story-analyze",
    "story-confirm",
    "story-generate-image",
    "story-save-draft",
    "admin-api",
    "story-translate",
  ];
  for (const name of invalidJsonAuthenticated) {
    const result = await rawFunction(name, { body: "{not-json", token: tokenA });
    if (name === "admin-api") {
      check(result.response.status === 403 && result.payload.code === "ADMIN_REQUIRED", "普通用户先被管理员鉴权拒绝");
    } else {
      check(result.response.status === 400 && result.payload.code === "INVALID_JSON", `${name} 登录后非法 JSON 被拒绝`);
    }
  }

  await expectError(
    "auth-change-password",
    { password: "New-Password-2026!", passwordConfirmation: "different-value" },
    "PASSWORD_MISMATCH",
    tokenB,
  );
  await callFunction(
    "auth-change-password",
    { password: "New-Password-2026!", passwordConfirmation: "New-Password-2026!" },
    tokenB,
  );
  const changedLogin = await callFunction(
    "auth-login",
    { accountIdentifier: userB.user.username, password: "New-Password-2026!" },
    config.publishableKey,
  );
  tokenB = changedLogin.payload.session.access_token;
  check(true, "修改密码成功且新密码可登录");

  const failedRecovery = await rawFunction("auth-recover", {
    body: JSON.stringify({
      accountIdentifier: userA.user.username,
      securityQuestion: "first_school",
      securityAnswer: "错误答案",
      password: "Recovered-Password!",
      passwordConfirmation: "Recovered-Password!",
    }),
    token: config.publishableKey,
  });
  check(failedRecovery.payload.code === "RECOVERY_FAILED", "错误密保答案使用统一找回失败提示");

  await expectError("story-save-draft", { draft: { ...completeDraft, cityLat: 91 } }, "INVALID_COORDINATES", tokenA);
  await expectError("story-analyze", { draft: { ...completeDraft, gender: "伪造值" } }, "GENDER_REQUIRED", tokenA);
  await expectError(
    "story-analyze",
    { draft: { ...completeDraft, body: "字".repeat(99) } },
    "INVALID_STORY_LENGTH",
    tokenA,
  );
  await expectError(
    "story-analyze",
    { draft: { ...completeDraft, body: "字".repeat(1501) } },
    "INVALID_STORY_LENGTH",
    tokenA,
  );
  await callFunction("story-save-draft", { draft: { ...completeDraft, body: "", age: "", gender: "" } }, tokenA);
  const userAClient = createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${tokenA}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userBClient = createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${tokenB}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: ownDraft } = await userAClient.from("story_drafts").select("age,gender").single();
  const { data: foreignDraft } = await userBClient.from("story_drafts").select("id").eq("user_id", userA.user.id);
  check(ownDraft?.age === null && ownDraft?.gender === "" && foreignDraft?.length === 0, "未完成草稿保存与跨用户隔离");

  const fixtureRows = [
    ["published", "公开故事"],
    ["private", "私密故事"],
    ["pending_review", "待审故事"],
    ["needs_edit", "需修改故事"],
    ["removed", "已下架故事"],
  ].map(([status, title], index) => ({
    user_id: userB.user.id,
    author_display_name: "QA 用户 B",
    title,
    body: storyBody,
    excerpt: storyBody.slice(0, 70),
    mood: "平和自足",
    life_stage: "成年早期",
    age: 27,
    gender: "女",
    city: "杭州",
    latitude: 30.2741,
    longitude: 120.1551,
    people: ["自己"],
    status,
    moderation_decision: status === "pending_review" ? "human_review" : "pass",
    final_type_id: status === "published" ? "career_achievement" : null,
    final_themes: status === "published" ? ["职业成长", "自我肯定"] : [],
    content_hash: `qa-boundary-${suffix}-${index}`,
    published_at: status === "published" ? new Date().toISOString() : null,
  }));
  const { data: fixtureStories, error: fixtureError } = await service
    .from("stories")
    .insert(fixtureRows)
    .select("id,status");
  if (fixtureError) throw fixtureError;
  createdStoryIds.push(...fixtureStories.map((story) => story.id));
  const publishedStory = fixtureStories.find((story) => story.status === "published");
  const privateStory = fixtureStories.find((story) => story.status === "private");
  const { data: ownPublishedStory, error: ownStoryError } = await service
    .from("stories")
    .insert({
      ...fixtureRows[0],
      user_id: userA.user.id,
      author_display_name: "QA 用户 A",
      title: "自己的公开故事",
      content_hash: `qa-own-${suffix}`,
    })
    .select("id")
    .single();
  if (ownStoryError) throw ownStoryError;
  createdStoryIds.push(ownPublishedStory.id);

  const anon = createClient(config.url, config.publishableKey, { auth: { persistSession: false } });
  const ids = fixtureStories.map((story) => story.id);
  const { data: anonVisible } = await anon.from("stories").select("id,status").in("id", ids);
  const { data: aVisible } = await userAClient.from("stories").select("id,status").in("id", ids);
  const { data: bVisible } = await userBClient.from("stories").select("id,status").in("id", ids);
  check(anonVisible?.length === 1 && anonVisible[0].status === "published", "匿名用户只读取公开故事");
  check(aVisible?.length === 1 && aVisible[0].status === "published", "其他用户只读取公开故事");
  check(bVisible?.length === 5, "作者可读取自己的全部故事状态");

  const roleUpdate = await userAClient.from("profiles").update({ role: "admin" }).eq("id", userA.user.id);
  check(Boolean(roleUpdate.error), "普通用户不能提升自身角色");
  const credentialRead = await userAClient.from("account_credentials").select("*");
  check(Boolean(credentialRead.error), "普通用户不能读取密保哈希表");
  const directStoryInsert = await userAClient.from("stories").insert(fixtureRows[0]);
  check(Boolean(directStoryInsert.error), "普通用户不能绕过 Function 直接写 stories");

  const beforeIdorCount = await service
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userA.user.id);
  await expectError(
    "story-analyze",
    { storyId: privateStory.id, draft: completeDraft },
    "STORY_NOT_FOUND",
    tokenA,
    "POST",
    404,
  );
  const afterIdorCount = await service
    .from("stories")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userA.user.id);
  check(beforeIdorCount.count === afterIdorCount.count, "伪造 storyId 不会意外创建新故事");
  await expectError(
    "story-confirm",
    {
      storyId: privateStory.id,
      draft: completeDraft,
      typeId: "career_achievement",
      themes: ["职业成长", "自我肯定"],
    },
    "STORY_NOT_FOUND",
    tokenA,
    "POST",
    404,
  );
  await expectError(
    "story-generate-image",
    { storyId: publishedStory.id, style: "clay-3d" },
    "STORY_NOT_FOUND",
    tokenA,
    "POST",
    404,
  );
  check(true, "故事编辑、确认和图片接口 IDOR 防护");

  await callFunction("reactions", { storyId: publishedStory.id, value: "like" }, tokenA);
  await callFunction("reactions", { storyId: publishedStory.id, value: "dislike" }, tokenA);
  await callFunction("reactions", { storyId: publishedStory.id, value: null }, tokenA);
  await expectError("reactions", { storyId: publishedStory.id, value: "love" }, "INVALID_REACTION", tokenA);
  await expectError("reactions", { storyId: privateStory.id, value: "like" }, "STORY_NOT_FOUND", tokenA);
  await expectError(
    "reactions",
    { storyId: ownPublishedStory.id, value: "like" },
    "SELF_REACTION_NOT_ALLOWED",
    tokenA,
    "POST",
    403,
  );
  const directOwnReaction = await userAClient
    .from("reactions")
    .insert({ user_id: userA.user.id, story_id: ownPublishedStory.id, value: "like" });
  check(Boolean(directOwnReaction.error), "数据库拒绝绕过接口给自己的故事点赞");
  check(true, "喜欢/不喜欢/清除与非公开故事边界");

  const reportOne = await callFunction(
    "reports",
    { storyId: publishedStory.id, reason: "其他", note: "x".repeat(1200) },
    tokenA,
  );
  const reportTwo = await callFunction(
    "reports",
    { storyId: publishedStory.id, reason: "隐私泄露", note: "再次报告" },
    tokenA,
  );
  const { data: reports } = await service
    .from("reports")
    .select("review_case_id,note")
    .in("id", [reportOne.payload.report.id, reportTwo.payload.report.id]);
  check(
    reports?.length === 2 && new Set(reports.map((item) => item.review_case_id)).size === 1,
    "重复举报复用审核案件",
  );
  check(
    reports?.some((item) => item.note.length === 1000),
    "举报说明按 1000 字安全截断",
  );
  await expectError("reports", { storyId: publishedStory.id, reason: "" }, "REPORT_REASON_REQUIRED", tokenA);
  await expectError("reports", { storyId: privateStory.id, reason: "其他" }, "STORY_NOT_FOUND", tokenA);
  await expectError(
    "reports",
    { storyId: ownPublishedStory.id, reason: "其他" },
    "SELF_REPORT_NOT_ALLOWED",
    tokenA,
    "POST",
    403,
  );
  const directOwnReport = await userAClient
    .from("reports")
    .insert({ reporter_id: userA.user.id, story_id: ownPublishedStory.id, reason: "其他" });
  check(Boolean(directOwnReport.error), "数据库拒绝绕过接口举报自己的故事");

  await expectError(
    "story-translate",
    { storyIds: [publishedStory.id], targetLanguage: "fr" },
    "INVALID_TARGET_LANGUAGE",
    tokenA,
  );
  await expectError(
    "story-translate",
    { storyIds: [privateStory.id], targetLanguage: "en" },
    "STORY_NOT_FOUND",
    tokenA,
    "POST",
    404,
  );
  const firstTranslation = await callFunction(
    "story-translate",
    { storyIds: [publishedStory.id], targetLanguage: "en" },
    tokenA,
  );
  const translatedStory = firstTranslation.payload.translations[publishedStory.id];
  check(Boolean(translatedStory?.title && translatedStory?.body), "中文公开故事生成完整英文呈现");
  check(Boolean(translatedStory?.city && !/[\u3400-\u9fff]/.test(translatedStory.city)), "英文呈现同步翻译城市");
  const secondTranslation = await callFunction(
    "story-translate",
    { storyIds: [publishedStory.id], targetLanguage: "en" },
    tokenA,
  );
  check(
    secondTranslation.payload.translations[publishedStory.id]?.translatedAt === translatedStory.translatedAt,
    "相同内容再次翻译命中数据库缓存",
  );

  await expectError("feedback", { text: "" }, "INVALID_FEEDBACK", tokenA);
  await callFunction("feedback", { text: "a" }, tokenA);
  await callFunction("feedback", { text: "字".repeat(2000) }, tokenA);
  await expectError("feedback", { text: "字".repeat(2001) }, "INVALID_FEEDBACK", tokenA);
  check(true, "反馈 0/1/2000/2001 字边界");

  const { data: notificationRows, error: notificationError } = await service
    .from("notifications")
    .insert([
      { user_id: userA.user.id, status: "pending", kind: "system", story_title: "A 通知", reason: "QA" },
      { user_id: userB.user.id, status: "pending", kind: "system", story_title: "B 通知", reason: "QA" },
    ])
    .select("id,user_id,read");
  if (notificationError) throw notificationError;
  const notificationA = notificationRows.find((item) => item.user_id === userA.user.id);
  const notificationB = notificationRows.find((item) => item.user_id === userB.user.id);
  await callFunction("notifications", { ids: [notificationA.id, notificationB.id] }, tokenA);
  const { data: notificationAudit } = await service
    .from("notifications")
    .select("id,read")
    .in("id", [notificationA.id, notificationB.id]);
  check(notificationAudit.find((item) => item.id === notificationA.id)?.read === true, "用户可标记自己的通知已读");
  check(notificationAudit.find((item) => item.id === notificationB.id)?.read === false, "通知 IDOR 不影响他人通知");

  const placesEmpty = await callFunction("places-search", { query: "" }, tokenA);
  const placesSpecial = await callFunction("places-search", { query: "<script>&城市" }, tokenA);
  const ipHint = await callFunction("places-ip-hint", {}, tokenA);
  check(
    Array.isArray(placesEmpty.payload.places) && Array.isArray(placesSpecial.payload.places),
    "地点空值/特殊字符安全降级",
  );
  check(Object.hasOwn(ipHint.payload, "place"), "IP 城市提示返回稳定结构");

  const currentRecommendations = await callFunction("recommendations-current", {}, tokenA, "GET");
  const refreshedRecommendations = await callFunction("recommendations-refresh", {}, tokenA);
  const lobby = await callFunction("lobby-stories", {}, tokenA, "GET");
  check(Array.isArray(currentRecommendations.payload.recommendations), "当前推荐空态结构稳定");
  check(Array.isArray(refreshedRecommendations.payload.recommendations), "推荐刷新空态结构稳定");
  check(Array.isArray(lobby.payload.recommendations), "大厅故事空态结构稳定");

  await service.from("profiles").update({ role: "admin" }).eq("id", userA.user.id);
  adminToken = tokenA;
  await callFunction("admin-api", { action: "dashboard" }, adminToken);
  await expectError("admin-api", { action: "dashboard" }, "ADMIN_REQUIRED", tokenB, "POST", 403);
  await expectError("admin-api", { action: "unknown-action" }, "UNKNOWN_ACTION", adminToken);
  await expectError(
    "admin-api",
    { action: "account-status", profileId: userB.user.id, status: "deleted" },
    "INVALID_ACCOUNT_STATUS",
    adminToken,
  );
  await expectError(
    "admin-api",
    { action: "account-status", profileId: "00000000-0000-0000-0000-000000000001", status: "active" },
    "ACCOUNT_NOT_FOUND",
    adminToken,
    "POST",
    404,
  );
  await expectError(
    "admin-api",
    { action: "account-status", profileId: userA.user.id, status: "suspended" },
    "CANNOT_SUSPEND_SELF",
    adminToken,
  );
  await expectError(
    "admin-api",
    { action: "account-reset-password", profileId: "00000000-0000-0000-0000-000000000001", password },
    "ACCOUNT_NOT_FOUND",
    adminToken,
    "POST",
    404,
  );
  await expectError(
    "admin-api",
    { action: "story-status", storyId: publishedStory.id, status: "private" },
    "INVALID_STORY_STATUS",
    adminToken,
  );
  await expectError(
    "admin-api",
    { action: "story-status", storyId: publishedStory.id, status: "removed", reason: "" },
    "REASON_REQUIRED",
    adminToken,
  );
  await expectError(
    "admin-api",
    { action: "story-status", storyId: "00000000-0000-0000-0000-000000000001", status: "removed", reason: "QA" },
    "STORY_NOT_FOUND",
    adminToken,
    "POST",
    404,
  );
  await expectError(
    "admin-api",
    { action: "review-open", reviewId: "00000000-0000-0000-0000-000000000001" },
    "REVIEW_NOT_FOUND",
    adminToken,
    "POST",
    404,
  );
  await expectError(
    "admin-api",
    { action: "review-decide", reviewId: "00000000-0000-0000-0000-000000000001", decision: "maybe" },
    "INVALID_REVIEW_DECISION",
    adminToken,
  );

  const { data: completedTask, error: taskError } = await service
    .from("ai_tasks")
    .insert({ story_id: publishedStory.id, user_id: userB.user.id, task_type: "story_analysis", status: "completed" })
    .select("id")
    .single();
  if (taskError) throw taskError;
  await expectError(
    "admin-api",
    { action: "task-retry", taskId: completedTask.id },
    "TASK_NOT_FAILED",
    adminToken,
    "POST",
    409,
  );
  await expectError(
    "admin-api",
    { action: "task-retry", taskId: "00000000-0000-0000-0000-000000000001" },
    "TASK_NOT_FOUND",
    adminToken,
    "POST",
    404,
  );

  const dashboard = await callFunction("admin-api", { action: "dashboard" }, adminToken);
  const analyticsReport = await callFunction(
    "admin-api",
    {
      action: "analytics-query",
      start: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      end: new Date(Date.now() + 60_000).toISOString(),
      account: userB.user.username,
      priority: "P0",
      module: "creation",
    },
    adminToken,
  );
  check(
    analyticsReport.payload.analytics?.selected_account?.username === userB.user.username,
    "实验看板按登录账号下钻",
  );
  check(
    Array.isArray(analyticsReport.payload.analytics?.recent_events) &&
      Array.isArray(analyticsReport.payload.analytics?.modules),
    "实验看板返回筛选时间线与行为模块",
  );
  await expectError(
    "admin-api",
    { action: "analytics-query", priority: "P000" },
    "INVALID_ANALYTICS_PRIORITY",
    adminToken,
  );
  await expectError(
    "admin-api",
    { action: "analytics-query", module: "performance" },
    "INVALID_ANALYTICS_MODULE",
    adminToken,
  );
  await expectError(
    "admin-api",
    { action: "analytics-query", account: "missing_account_qa" },
    "ANALYTICS_ACCOUNT_NOT_FOUND",
    adminToken,
    "POST",
    404,
  );
  const typeIds = dashboard.payload.types.map((item) => item.id);
  await expectError(
    "admin-api",
    { action: "type-update", typeId: typeIds[0], color: "red" },
    "INVALID_TYPE_UPDATE",
    adminToken,
  );
  await expectError(
    "admin-api",
    { action: "types-reorder", orderedIds: typeIds.slice(0, 20) },
    "INVALID_TYPE_ORDER",
    adminToken,
  );
  await expectError(
    "admin-api",
    {
      action: "config-save-draft",
      weights: { city: -0.1, life: 0.35, theme: 0.4, semantic: 0.35, age: 0.5, stage: 0.3, gender: 0.2 },
    },
    "INVALID_WEIGHT_TOTAL",
    adminToken,
  );
  await expectError("admin-api", { action: "seed-import", rows: [] }, "INVALID_IMPORT", adminToken);
  await expectError(
    "admin-api",
    { action: "seed-import", rows: Array.from({ length: 501 }, () => ({ external_id: "x" })) },
    "INVALID_IMPORT",
    adminToken,
  );
  const invalidSeed = await callFunction(
    "admin-api",
    {
      action: "seed-import",
      filename: "qa-invalid.csv",
      rows: [
        { external_id: "", skip_moderation: "false" },
        {
          external_id: `qa-invalid-${suffix}`,
          title: "无来源",
          body: storyBody,
          age: "27",
          gender: "女",
          stage: "成年早期",
          city: "上海",
          latitude: "31.2",
          longitude: "121.4",
          mood: "平和自足",
          people: "自己",
          skip_moderation: "true",
          source_note: "",
        },
      ],
    },
    adminToken,
  );
  createdImportBatchIds.push(invalidSeed.payload.batchId);
  check(invalidSeed.payload.imported === 0 && invalidSeed.payload.failed === 2, "冷启动逐行失败隔离与失败计数");

  await callFunction(
    "admin-api",
    { action: "account-status", profileId: userB.user.id, status: "suspended" },
    adminToken,
  );
  const suspendedFunction = await rawFunction("notifications", { method: "GET", token: tokenB });
  const suspendedLogin = await rawFunction("auth-login", {
    body: JSON.stringify({ accountIdentifier: userB.user.username, password: "New-Password-2026!" }),
    token: config.publishableKey,
  });
  check(
    suspendedFunction.response.status === 403 && suspendedFunction.payload.code === "ACCOUNT_SUSPENDED",
    "停用账号已有会话即时失效",
  );
  check(
    suspendedLogin.response.status === 401 && suspendedLogin.payload.code === "INVALID_CREDENTIALS",
    "停用账号无法重新登录",
  );
  await callFunction("admin-api", { action: "account-status", profileId: userB.user.id, status: "active" }, adminToken);

  const { count: auditCount, error: auditError } = await service
    .from("admin_audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", userA.user.id);
  if (auditError) throw auditError;
  check((auditCount ?? 0) >= 2, "管理员成功写操作均产生审计记录", String(auditCount));

  process.stdout.write(
    `\nQA local boundary suite passed: ${checks.length} assertions; ${findings.length} recorded finding(s).\n`,
  );
} finally {
  if (createdStoryIds.length) await service.from("stories").delete().in("id", createdStoryIds);
  if (createdImportBatchIds.length) await service.from("import_batches").delete().in("id", createdImportBatchIds);
  if (createdConfigIds.length) await service.from("algorithm_configs").delete().in("id", createdConfigIds);
  if (createdUserIds.length) {
    await service.from("admin_audit_logs").delete().in("admin_id", createdUserIds);
    await service.from("algorithm_configs").delete().in("created_by", createdUserIds);
    await service.from("import_batches").delete().in("created_by", createdUserIds);
  }
  for (const userId of createdUserIds.reverse()) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) process.stderr.write(`QA cleanup warning (${userId}): ${error.message}\n`);
  }
}
