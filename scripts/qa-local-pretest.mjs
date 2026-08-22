import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function localSupabase() {
  const result = spawnSync("npx", ["supabase", "status", "-o", "json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr || "Could not read local Supabase status.");
  const start = result.stdout.indexOf("{");
  const status = JSON.parse(result.stdout.slice(start));
  if (!String(status.API_URL).startsWith("http://127.0.0.1:")) {
    throw new Error("Pretest QA refuses to run against a non-local Supabase project.");
  }
  return {
    url: String(status.API_URL),
    publishableKey: String(status.PUBLISHABLE_KEY),
    secretKey: String(status.SECRET_KEY),
  };
}

const config = localSupabase();
const origin = "http://127.0.0.1:4173";
const service = createClient(config.url, config.secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const createdUserIds = [];
const createdEventIds = [];
let adminUserId = "";

function check(value, label, detail = "") {
  if (!value) throw new Error(`${label}${detail ? `: ${detail}` : ""}`);
  process.stdout.write(`✓ ${label}${detail ? ` — ${detail}` : ""}\n`);
}

async function requestFunction(name, { token = config.publishableKey, body, method = "POST" } = {}) {
  const response = await fetch(`${config.url}/functions/v1/${name}`, {
    method,
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: origin,
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function expectOk(name, options) {
  const result = await requestFunction(name, options);
  if (!result.response.ok) {
    throw new Error(`${name} returned ${result.response.status}: ${result.payload.code ?? result.payload.error}`);
  }
  return result.payload;
}

async function expectError(name, options, expectedCode, expectedStatus) {
  const result = await requestFunction(name, options);
  check(
    !result.response.ok &&
      result.payload.code === expectedCode &&
      (!expectedStatus || result.response.status === expectedStatus),
    `${name} rejects ${expectedCode}`,
    `HTTP ${result.response.status}`,
  );
}

async function signup(label) {
  const suffix = `${Date.now().toString(36)}_${label}`.replace(/[^a-z0-9_]/g, "").slice(-13);
  const username = `pt_${suffix}`.slice(0, 20);
  const password = "StoryVerse-Pretest-2026!";
  const payload = await expectOk("auth-signup", {
    body: {
      accountIdentifier: username,
      displayName: `前测 QA ${label}`,
      password,
      passwordConfirmation: password,
      securityQuestion: "first_school",
      securityAnswer: `answer-${label}`,
    },
  });
  check(payload.session?.access_token && payload.user?.id, `创建 ${label} 测试账号`);
  createdUserIds.push(payload.user.id);
  return { id: payload.user.id, username, token: payload.session.access_token };
}

const step1 = { consented: true };
const step2 = {
  ...step1,
  birthYear: 2000,
  gender: "female",
  residenceRegion: "china_mainland",
  countryRegion: null,
  province: "bei_jing_shi",
  city: "bei_jing_shi",
  communityType: "residents_committee",
};
const step3 = {
  ...step2,
  ethnicity: "han_zu",
  education: "bachelor",
  educationOther: null,
};
const completedAnswers = {
  ...step3,
  employment: "student_unpaid",
  industryPrimary: null,
  industrySecondary: null,
  discipline: "gong_xue",
  major: "ji_suan_ji_lei",
};

function analyticsEvent(name) {
  const eventId = randomUUID();
  createdEventIds.push(eventId);
  return {
    event_id: eventId,
    event_name: name,
    occurred_at: new Date().toISOString(),
    anonymous_id: randomUUID(),
    session_id: randomUUID(),
    page_view_id: randomUUID(),
    lobby_view_id: null,
    recommendation_batch_id: null,
    page_id: "pretest_qa",
    route: "/PreTest",
    component: "qa-local-pretest",
    language: "zh",
    theme: "day",
    device_type: "desktop",
    viewport: { width: 1280, height: 800, pixel_ratio: 1 },
    browser: "QA",
    os: "QA",
    study_id: "storyverse_lab_v1",
    condition_id: "pretest_qa",
    app_version: "qa",
    environment: "test",
    properties: { qa_run: true },
  };
}

try {
  const participant = await signup("complete");
  let progress = await expectOk("pretest", { token: participant.token, method: "GET" });
  check(progress.required && progress.status === "not_started" && progress.currentStep === 1, "新账号默认必须前测");

  await expectError(
    "pretest",
    { token: participant.token, body: { action: "submit", step: 4, answers: completedAnswers } },
    "PRETEST_STEP_OUT_OF_ORDER",
    409,
  );
  await expectOk("pretest", { token: participant.token, body: { action: "save", step: 1, answers: step1 } });
  progress = await expectOk("pretest", { token: participant.token, method: "GET" });
  check(
    progress.status === "in_progress" && progress.currentStep === 2 && progress.draft.consented,
    "第一步草稿跨请求恢复",
  );

  await expectError(
    "pretest",
    { token: participant.token, body: { action: "save", step: 2, answers: { ...step2, birthYear: 1899 } } },
    "INVALID_BIRTH_YEAR",
    400,
  );
  await expectError(
    "pretest",
    { token: participant.token, body: { action: "save", step: 2, answers: { ...step2, birthYear: 2027 } } },
    "INVALID_BIRTH_YEAR",
    400,
  );
  await expectError(
    "pretest",
    {
      token: participant.token,
      body: { action: "save", step: 2, answers: { ...step2, countryRegion: "China" } },
    },
    "PRETEST_HIDDEN_FIELD",
    400,
  );
  await expectError(
    "pretest",
    {
      token: participant.token,
      body: { action: "save", step: 2, answers: { ...step2, city: "shang_hai_shi" } },
    },
    "INVALID_PRETEST_CITY",
    400,
  );
  await expectOk("pretest", { token: participant.token, body: { action: "save", step: 2, answers: step2 } });
  await expectOk("pretest", { token: participant.token, body: { action: "save", step: 3, answers: step3 } });
  await expectError(
    "pretest",
    {
      token: participant.token,
      body: {
        action: "save",
        step: 4,
        answers: {
          ...step3,
          employment: "full_time",
          industryPrimary: "i_t_hu_lian_wang_you_xi",
          industrySecondary: "yin_hang",
          discipline: null,
          major: null,
        },
      },
    },
    "INVALID_PRETEST_INDUSTRY",
    400,
  );
  await expectError(
    "pretest",
    {
      token: participant.token,
      body: { action: "submit", step: 4, answers: { ...completedAnswers, major: null } },
    },
    "PRETEST_MAJOR_REQUIRED",
    400,
  );
  progress = await expectOk("pretest", {
    token: participant.token,
    body: { action: "submit", step: 4, answers: completedAnswers },
  });
  check(progress.status === "completed" && progress.submittedAt, "完整问卷提交并锁定");
  await expectError(
    "pretest",
    { token: participant.token, body: { action: "save", step: 1, answers: step1 } },
    "PRETEST_LOCKED",
    409,
  );

  const participantClient = createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${participant.token}` } },
    auth: { persistSession: false },
  });
  const { data: ownRows, error: ownReadError } = await participantClient.from("pretest_responses").select("status");
  check(!ownReadError && ownRows?.length === 1 && ownRows[0].status === "completed", "RLS 允许读取自己的前测");
  const { error: directWriteError } = await participantClient
    .from("pretest_responses")
    .update({ current_step: 1 })
    .eq("user_id", participant.id);
  check(Boolean(directWriteError), "RLS 拒绝用户直接写入前测表");
  const { error: gateBypassError } = await participantClient
    .from("profiles")
    .update({ pretest_required: false })
    .eq("id", participant.id);
  check(Boolean(gateBypassError), "普通用户不能修改自己的前测门禁");

  const analyticsAfterConsent = await requestFunction("analytics-track", {
    token: participant.token,
    body: { events: [analyticsEvent("pretest_submitted")] },
  });
  check(analyticsAfterConsent.response.ok && analyticsAfterConsent.payload.accepted === 1, "同意后允许登录态埋点");

  const declining = await signup("decline");
  const analyticsBeforeConsent = await requestFunction("analytics-track", {
    token: declining.token,
    body: { events: [analyticsEvent("pretest_step_viewed")] },
  });
  check(
    analyticsBeforeConsent.response.status === 403 &&
      analyticsBeforeConsent.payload.code === "PRETEST_CONSENT_REQUIRED",
    "同意前服务端拒绝登录态产品埋点",
  );
  await expectOk("pretest", { token: declining.token, body: { action: "save", step: 1, answers: step1 } });
  progress = await expectOk("pretest", { token: declining.token, body: { action: "decline" } });
  check(progress.status === "declined" && progress.draft === null && progress.declinedAt, "拒绝状态保存且人口信息清空");
  const { data: declinedRow, error: declinedError } = await service
    .from("pretest_responses")
    .select("birth_year,gender,province,education,employment,status")
    .eq("user_id", declining.id)
    .single();
  check(
    !declinedError &&
      declinedRow.status === "declined" &&
      [
        declinedRow.birth_year,
        declinedRow.gender,
        declinedRow.province,
        declinedRow.education,
        declinedRow.employment,
      ].every((value) => value === null),
    "拒绝记录不保留人口统计答案",
  );

  const otherClient = createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${declining.token}` } },
    auth: { persistSession: false },
  });
  const { data: otherRows, error: otherReadError } = await otherClient
    .from("pretest_responses")
    .select("status")
    .eq("user_id", participant.id);
  check(!otherReadError && otherRows?.length === 0, "RLS 隔离其他参与者答案");

  const bypass = await signup("bypass");
  const { error: bypassUpdateError } = await service
    .from("profiles")
    .update({ pretest_required: false })
    .eq("id", bypass.id);
  if (bypassUpdateError) throw bypassUpdateError;
  progress = await expectOk("pretest", { token: bypass.token, method: "GET" });
  check(progress.status === "not_required" && progress.required === false, "迁移前账号兼容为不需要前测");

  const admin = await signup("admin");
  adminUserId = admin.id;
  const { error: roleError } = await service.from("profiles").update({ role: "admin" }).eq("id", admin.id);
  if (roleError) throw roleError;
  progress = await expectOk("pretest", { token: admin.token, method: "GET" });
  check(progress.status === "not_required", "管理员绕过前测");

  const queryPayload = await expectOk("admin-api", {
    token: admin.token,
    body: { action: "pretest-query", account: participant.username, status: "completed" },
  });
  check(
    queryPayload.responses?.length === 1 && queryPayload.responses[0].username === participant.username,
    "管理员按账号和状态筛选并下钻前测",
  );
  const exportPayload = await expectOk("admin-api", {
    token: admin.token,
    body: { action: "pretest-export", account: participant.username, status: "completed" },
  });
  check(exportPayload.responses?.length === 1, "管理员导出当前筛选范围");
  const { count: auditCount, error: auditError } = await service
    .from("admin_audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", admin.id)
    .eq("action", "pretest-export");
  check(!auditError && auditCount === 1, "前测导出写入管理员审计日志");

  process.stdout.write("\nPretest local API QA passed.\n");
} finally {
  if (createdEventIds.length) await service.from("analytics_events").delete().in("event_id", createdEventIds);
  if (adminUserId) await service.from("admin_audit_logs").delete().eq("admin_id", adminUserId);
  for (const userId of createdUserIds.reverse()) {
    await service.auth.admin.deleteUser(userId);
  }
}
