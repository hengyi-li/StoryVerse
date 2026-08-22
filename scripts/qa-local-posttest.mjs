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
    throw new Error("Posttest QA refuses to run against a non-local Supabase project.");
  }
  return {
    url: String(status.API_URL),
    publishableKey: String(status.PUBLISHABLE_KEY),
    secretKey: String(status.SECRET_KEY),
  };
}

function numberedIds(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}_${String(index + 1).padStart(2, "0")}`);
}

const sectionIds = [
  numberedIds("engagement", 8),
  numberedIds("publicness", 10),
  numberedIds("diversity", 7),
  numberedIds("recommendation", 10),
  numberedIds("authorship_ai", 6),
];
const allItemIds = sectionIds.flat();
const sectionAnswers = sectionIds.map((ids, sectionIndex) =>
  Object.fromEntries(ids.map((id, itemIndex) => [id, ((sectionIndex + itemIndex) % 5) + 1])),
);
const completeAnswers = Object.assign({}, ...sectionAnswers);

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
  const username = `po_${suffix}`.slice(0, 20);
  const password = "StoryVerse-Posttest-2026!";
  const payload = await expectOk("auth-signup", {
    body: {
      accountIdentifier: username,
      displayName: `后测 QA ${label}`,
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

const pretestStep1 = { consented: true };
const pretestStep2 = {
  ...pretestStep1,
  birthYear: 2000,
  gender: "female",
  residenceRegion: "china_mainland",
  countryRegion: null,
  province: "bei_jing_shi",
  city: "bei_jing_shi",
  communityType: "residents_committee",
};
const pretestStep3 = {
  ...pretestStep2,
  ethnicity: "han_zu",
  education: "bachelor",
  educationOther: null,
};
const pretestComplete = {
  ...pretestStep3,
  employment: "student_unpaid",
  industryPrimary: null,
  industrySecondary: null,
  discipline: "gong_xue",
  major: "ji_suan_ji_lei",
};

async function completePretest(token) {
  await expectOk("pretest", { token, body: { action: "save", step: 1, answers: pretestStep1 } });
  await expectOk("pretest", { token, body: { action: "save", step: 2, answers: pretestStep2 } });
  await expectOk("pretest", { token, body: { action: "save", step: 3, answers: pretestStep3 } });
  const progress = await expectOk("pretest", {
    token,
    body: { action: "submit", step: 4, answers: pretestComplete },
  });
  check(progress.status === "completed", "完成测试账号前测");
}

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
    page_id: "posttest_qa",
    route: "/PostTest",
    component: "qa-local-posttest",
    language: "zh",
    theme: "day",
    device_type: "desktop",
    viewport: { width: 1280, height: 800, pixel_ratio: 1 },
    browser: "QA",
    os: "QA",
    study_id: "storyverse_lab_v1",
    condition_id: "posttest_qa",
    app_version: "qa",
    environment: "test",
    properties: { questionnaire_version: "posttest_v1", step: 1, answer_count: 8 },
  };
}

try {
  const incomplete = await signup("incomplete");
  let progress = await expectOk("posttest", { token: incomplete.token, method: "GET" });
  check(progress.required === false && progress.status === "not_required", "未完成前测的账号不需要后测");
  await expectError(
    "posttest",
    { token: incomplete.token, body: { action: "dismiss_reminder" } },
    "POSTTEST_NOT_REQUIRED",
    409,
  );

  const participant = await signup("complete");
  await completePretest(participant.token);
  progress = await expectOk("posttest", { token: participant.token, method: "GET" });
  check(
    progress.required && progress.status === "not_started" && progress.currentStep === 1,
    "完成前测的普通参与者默认需要后测",
  );

  progress = await expectOk("posttest", {
    token: participant.token,
    body: { action: "dismiss_reminder" },
  });
  check(progress.status === "not_started" && progress.reminderDismissedAt, "提醒关闭时间保存到服务端");
  const reminderTimestamp = progress.reminderDismissedAt;
  progress = await expectOk("posttest", { token: participant.token, method: "GET" });
  check(progress.reminderDismissedAt === reminderTimestamp, "提醒关闭状态跨请求恢复");

  await expectError(
    "posttest",
    { token: participant.token, body: { action: "save", step: 2, answers: sectionAnswers[1] } },
    "POSTTEST_STEP_OUT_OF_ORDER",
    409,
  );
  for (const score of [0, 6, 1.5, "5"]) {
    await expectError(
      "posttest",
      {
        token: participant.token,
        body: { action: "save", step: 1, answers: { ...sectionAnswers[0], engagement_01: score } },
      },
      "INVALID_POSTTEST_SCORE",
      400,
    );
  }
  await expectError(
    "posttest",
    {
      token: participant.token,
      body: { action: "save", step: 1, answers: { ...sectionAnswers[0], unexpected_01: 3 } },
    },
    "UNKNOWN_POSTTEST_ITEM",
    400,
  );
  const incompleteStep = { ...sectionAnswers[0] };
  delete incompleteStep.engagement_08;
  await expectError(
    "posttest",
    { token: participant.token, body: { action: "save", step: 1, answers: incompleteStep } },
    "POSTTEST_ANSWER_REQUIRED",
    400,
  );

  progress = await expectOk("posttest", {
    token: participant.token,
    body: { action: "save", step: 1, answers: sectionAnswers[0] },
  });
  check(progress.status === "in_progress" && progress.currentStep === 2, "第一部分保存并进入第二部分");
  progress = await expectOk("posttest", { token: participant.token, method: "GET" });
  check(Object.keys(progress.answers).length === 8 && progress.currentStep === 2, "后测草稿跨请求恢复");

  const participantClient = createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${participant.token}` } },
    auth: { persistSession: false },
  });
  const { data: ownRows, error: ownReadError } = await participantClient
    .from("posttest_responses")
    .select("status,current_step");
  check(!ownReadError && ownRows?.length === 1 && ownRows[0].current_step === 2, "RLS 允许读取自己的后测进度");
  const { error: directWriteError } = await participantClient
    .from("posttest_responses")
    .update({ current_step: 5 })
    .eq("user_id", participant.id);
  check(Boolean(directWriteError), "RLS 拒绝参与者直接写入后测表");

  for (let step = 2; step <= 4; step += 1) {
    progress = await expectOk("posttest", {
      token: participant.token,
      body: { action: "save", step, answers: sectionAnswers[step - 1] },
    });
    check(progress.currentStep === step + 1, `保存后测第 ${step} 部分`);
  }
  await expectError(
    "posttest",
    {
      token: participant.token,
      body: { action: "submit", step: 5, answers: { ...sectionAnswers[4], authorship_ai_06: undefined } },
    },
    "POSTTEST_ANSWER_REQUIRED",
    400,
  );
  progress = await expectOk("posttest", {
    token: participant.token,
    body: { action: "submit", step: 5, answers: sectionAnswers[4] },
  });
  check(
    progress.status === "completed" && progress.submittedAt && Object.keys(progress.answers).length === 41,
    "41 道题完整提交并锁定",
  );
  const repeated = await expectOk("posttest", {
    token: participant.token,
    body: { action: "submit", step: 5, answers: completeAnswers },
  });
  check(repeated.submittedAt === progress.submittedAt, "重复提交采用幂等返回");
  await expectError(
    "posttest",
    { token: participant.token, body: { action: "save", step: 1, answers: sectionAnswers[0] } },
    "POSTTEST_LOCKED",
    409,
  );
  const { error: completedMutationError } = await service
    .from("posttest_responses")
    .update({ current_step: 1 })
    .eq("user_id", participant.id);
  check(Boolean(completedMutationError), "数据库触发器锁定已完成答案");

  const analyticsResult = await requestFunction("analytics-track", {
    token: participant.token,
    body: { events: [analyticsEvent("posttest_step_saved")] },
  });
  check(analyticsResult.response.ok && analyticsResult.payload.accepted === 1, "后测行为事件可上报");
  const { data: analyticsRow, error: analyticsError } = await service
    .from("analytics_events")
    .select("properties")
    .eq("event_id", createdEventIds.at(-1))
    .single();
  check(
    !analyticsError &&
      analyticsRow.properties.answer_count === 8 &&
      !allItemIds.some((itemId) => itemId in analyticsRow.properties),
    "埋点不复制后测题目分值",
  );

  const other = await signup("other");
  const otherClient = createClient(config.url, config.publishableKey, {
    global: { headers: { Authorization: `Bearer ${other.token}` } },
    auth: { persistSession: false },
  });
  const { data: otherRows, error: otherReadError } = await otherClient
    .from("posttest_responses")
    .select("status")
    .eq("user_id", participant.id);
  check(!otherReadError && otherRows?.length === 0, "RLS 隔离其他参与者后测答案");

  const legacy = await signup("legacy");
  const { error: legacyError } = await service.from("profiles").update({ pretest_required: false }).eq("id", legacy.id);
  if (legacyError) throw legacyError;
  progress = await expectOk("posttest", { token: legacy.token, method: "GET" });
  check(progress.status === "not_required", "迁移前兼容账号不需要后测");

  const admin = await signup("admin");
  adminUserId = admin.id;
  const { error: roleError } = await service.from("profiles").update({ role: "admin" }).eq("id", admin.id);
  if (roleError) throw roleError;
  progress = await expectOk("posttest", { token: admin.token, method: "GET" });
  check(progress.status === "not_required", "管理员绕过后测");

  const queryPayload = await expectOk("admin-api", {
    token: admin.token,
    body: { action: "posttest-query", account: participant.username, status: "completed" },
  });
  check(
    queryPayload.responses?.length === 1 &&
      queryPayload.responses[0].username === participant.username &&
      allItemIds.every((itemId) => Number.isInteger(queryPayload.responses[0][itemId])),
    "管理员按账号和状态筛选并下钻 41 个答案",
  );
  const nicknamePayload = await expectOk("admin-api", {
    token: admin.token,
    body: { action: "posttest-query", account: "后测 qa complete" },
  });
  check(nicknamePayload.responses?.length === 1, "管理员可以按昵称筛选后测");
  const exportPayload = await expectOk("admin-api", {
    token: admin.token,
    body: { action: "posttest-export", account: participant.username, status: "completed" },
  });
  check(exportPayload.responses?.length === 1, "管理员导出当前后测筛选范围");
  const { count: auditCount, error: auditError } = await service
    .from("admin_audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("admin_id", admin.id)
    .eq("action", "posttest-export");
  check(!auditError && auditCount === 1, "后测导出写入管理员审计日志");

  process.stdout.write("\nPosttest local API QA passed.\n");
} finally {
  if (createdEventIds.length) await service.from("analytics_events").delete().in("event_id", createdEventIds);
  if (adminUserId) await service.from("admin_audit_logs").delete().eq("admin_id", adminUserId);
  for (const userId of createdUserIds.reverse()) {
    await service.auth.admin.deleteUser(userId);
  }
}
