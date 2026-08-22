import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { requiredFrontendOrigin } from "./lib/frontend-origin.mjs";

const PROJECT_REF = "zgyrbtdyraxglxhbkazp";
const projectUrl = `https://${PROJECT_REF}.supabase.co`;
const allowedOrigin = requiredFrontendOrigin();

function check(condition, label) {
  if (!condition) throw new Error(label);
  process.stdout.write(`✓ ${label}\n`);
}

function parseJsonOutput(output) {
  const objectStart = output.indexOf("{");
  const arrayStart = output.indexOf("[");
  const start = objectStart < 0 ? arrayStart : arrayStart < 0 ? objectStart : Math.min(objectStart, arrayStart);
  if (start < 0) throw new Error("Supabase CLI did not return JSON.");
  return JSON.parse(output.slice(start));
}

function apiKeys() {
  const result = spawnSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", PROJECT_REF, "--reveal", "--output", "json"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || "Could not read online Supabase API keys.");
  const payload = parseJsonOutput(result.stdout);
  const keys = Array.isArray(payload) ? payload : (payload.api_keys ?? payload.keys ?? []);
  const secret = keys.find((item) => item.type === "secret") ?? keys.find((item) => item.name === "service_role");
  const publishable =
    keys.find((item) => item.type === "publishable") ?? keys.find((item) => item.name === "anon" || item.id === "anon");
  const secretKey = String(secret?.api_key ?? secret?.key ?? "");
  const publishableKey = String(publishable?.api_key ?? publishable?.key ?? "");
  if (!secretKey || !publishableKey) throw new Error("Could not resolve online Supabase API keys.");
  return { secretKey, publishableKey };
}

async function signup(publishableKey, accountIdentifier, password) {
  const response = await fetch(`${projectUrl}/functions/v1/auth-signup`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      Origin: allowedOrigin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      accountIdentifier,
      displayName: "Recovery QA",
      password,
      passwordConfirmation: password,
      securityQuestion: "first_school",
      securityAnswer: "恢复测试学校",
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`auth-signup returned ${response.status}: ${payload.code ?? payload.error}`);
  return payload;
}

const linkedProjectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
if (linkedProjectRef !== PROJECT_REF) throw new Error(`Refusing online QA for linked project ${linkedProjectRef}.`);

const { secretKey, publishableKey } = apiKeys();
const service = createClient(projectUrl, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = Date.now().toString(36).slice(-7);
const username = `qa_recover_${suffix}`.slice(0, 20);
const password = `QA-${randomUUID()}-Aa9!`;
let userId = "";

try {
  const signupResult = await signup(publishableKey, username, password);
  userId = signupResult.user.id;
  const accessToken = signupResult.session.access_token;
  check(Boolean(userId && accessToken), "隔离恢复账号创建成功");

  const body =
    "这是用于验证故事恢复流程的隔离测试正文。用户即使刷新页面、返回大厅或重新登录，仍然应该从数据库读取完整故事，而不是看到一篇空白的新故事。测试结束后，这篇故事和账号都会自动删除。".repeat(
      2,
    );
  const { data: inserted, error: insertError } = await service
    .from("stories")
    .insert({
      user_id: userId,
      author_display_name: "Recovery QA",
      title: "恢复流程隔离测试",
      body,
      excerpt: body.slice(0, 70),
      guide: "",
      custom_guide: "",
      mood: "平和自足",
      life_stage: "成年早期",
      age: 29,
      gender: "女",
      city: "上海",
      city_name_en: "Shanghai",
      city_country: "China",
      latitude: 31.2304,
      longitude: 121.4737,
      people: ["自己", "朋友"],
      status: "pending_review",
      moderation_decision: "human_review",
      ai_suggested_title: "恢复流程隔离测试",
      ai_type_id: "career_achievement",
      ai_themes: ["重新开始", "朋友支持"],
      content_hash: `qa-recovery-${suffix}`,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;

  const owner = createClient(projectUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: pending, error: pendingError } = await owner
    .from("stories")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["analyzing", "pending_review", "needs_confirmation"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pendingError) throw pendingError;
  check(pending?.id === inserted.id && pending.body === body, "作者可完整恢复待人工审核故事");

  const { data: storyType, error: typeError } = await owner
    .from("story_types")
    .select("id,parent_type,label_zh,label_en,color")
    .eq("id", pending.ai_type_id)
    .maybeSingle();
  if (typeError) throw typeError;
  check(storyType?.id === "career_achievement", "恢复故事可读取类型与标签信息");

  const anonymous = createClient(projectUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: hidden, error: hiddenError } = await anonymous
    .from("stories")
    .select("id")
    .eq("id", inserted.id)
    .maybeSingle();
  if (hiddenError) throw hiddenError;
  check(hidden === null, "待人工审核故事不会被其他访客读取");

  const { error: updateError } = await service
    .from("stories")
    .update({
      status: "needs_confirmation",
      moderation_decision: "pass",
      final_type_id: "career_achievement",
      final_themes: ["最终主题一", "最终主题二"],
    })
    .eq("id", inserted.id);
  if (updateError) throw updateError;
  const { data: confirmation, error: confirmationError } = await owner
    .from("stories")
    .select("id,status,body,final_themes")
    .eq("id", inserted.id)
    .maybeSingle();
  if (confirmationError) throw confirmationError;
  check(
    confirmation?.status === "needs_confirmation" &&
      confirmation.body === body &&
      confirmation.final_themes.length === 2,
    "作者可完整恢复待最终确认故事",
  );

  process.stdout.write("Online story recovery QA passed: 5 checks.\n");
} finally {
  if (userId) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) process.stderr.write(`Recovery QA cleanup warning for ${userId}: ${error.message}\n`);
  }
}
