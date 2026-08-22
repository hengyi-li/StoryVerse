import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const EXPECTED_PENDING_COPY =
  "StoryVerse 暂时无法自动确认这篇故事是否适合公开，因此已进入人工确认队列。这不代表故事存在问题；故事已经安全保存，确认完成前仅自己可见。";
const PASSWORD = "StoryVerse-QA-Review-2026!";

function localSupabase() {
  const result = spawnSync("npx", ["supabase", "status", "-o", "json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Could not read local Supabase status: ${result.stderr.trim()}`);
  const status = JSON.parse(result.stdout.slice(result.stdout.indexOf("{")));
  if (!String(status.API_URL).startsWith("http://127.0.0.1:")) {
    throw new Error("Review-flow QA refuses to operate on a remote Supabase project.");
  }
  return { url: status.API_URL, publishableKey: status.PUBLISHABLE_KEY, secretKey: status.SECRET_KEY };
}

const config = localSupabase();
const service = createClient(config.url, config.secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function call(name, body, token = config.publishableKey, method = "POST") {
  const response = await fetch(`${config.url}/functions/v1/${name}`, {
    method,
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:4173",
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${name} ${response.status}: ${payload.code ?? payload.error ?? "unknown"}`);
    error.code = payload.code;
    throw error;
  }
  return payload;
}

async function signup(accountIdentifier, displayName) {
  const payload = await call("auth-signup", {
    accountIdentifier,
    displayName,
    password: PASSWORD,
    passwordConfirmation: PASSWORD,
    securityQuestion: "first_school",
    securityAnswer: "QA 测试学校",
  });
  if (!payload.user?.id || !payload.session?.access_token) throw new Error("QA signup did not return a session.");
  return { id: payload.user.id, token: payload.session.access_token };
}

async function login(accountIdentifier) {
  const payload = await call("auth-login", { accountIdentifier, password: PASSWORD });
  if (!payload.session?.access_token) throw new Error(`QA login did not return a session for ${accountIdentifier}.`);
  return payload.session.access_token;
}

async function profile(accountIdentifier) {
  const { data, error } = await service
    .from("profiles")
    .select("id,username,display_name,role")
    .eq("username", accountIdentifier)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function cleanupAccounts(accounts) {
  const profiles = (await Promise.all(accounts.map(profile))).filter(Boolean);
  for (const item of profiles) {
    if (!item.username.startsWith("qa_review_") || !String(item.display_name).startsWith("QA ")) {
      throw new Error(`Safety stop: refusing to clean non-QA account ${item.username}`);
    }
  }
  const ids = profiles.map((item) => item.id);
  if (ids.length) {
    await service.from("admin_audit_logs").delete().in("admin_id", ids);
    await service.from("review_cases").update({ reviewer_id: null }).in("reviewer_id", ids);
    for (const item of profiles) {
      const { error } = await service.auth.admin.deleteUser(item.id);
      if (error) throw error;
    }
  }
  return profiles.length;
}

async function setup() {
  const suffix = Date.now().toString(36).slice(-7);
  const userAccount = `qa_review_u_${suffix}`;
  const adminAccount = `qa_review_a_${suffix}`;
  const createdAccounts = [];
  try {
    const user = await signup(userAccount, `QA 待确认用户 ${suffix}`);
    createdAccounts.push(userAccount);
    const admin = await signup(adminAccount, `QA 审核管理员 ${suffix}`);
    createdAccounts.push(adminAccount);
    const { error: roleError } = await service.from("profiles").update({ role: "admin" }).eq("id", admin.id);
    if (roleError) throw roleError;

    const title = `QA 人工确认释放 ${suffix}`;
    const body =
      "这是一篇只用于 StoryVerse 本地回归测试的虚构故事，不对应任何真实人物。我在文中写出一位第三方的完整姓名、手机号码 13800000000、私人邮箱、社交账号和具体家庭门牌，并邀请陌生人按照这些信息联系对方。这样的内容需要在公开前进入人工确认，而不能直接展示在星空大厅。测试同时需要确认故事会安全保存、管理员能看到审核任务，并在允许公开后向作者返回明确结果。";
    const result = await call(
      "story-analyze",
      {
        draft: {
          guide: "",
          customGuide: "",
          title,
          body,
          age: "30",
          gender: "其他",
          stage: "成年早期",
          city: "上海",
          cityLat: 31.2304,
          cityLon: 121.4737,
          cityNameEn: "Shanghai",
          cityCountry: "China",
          mood: "担心",
          people: ["自己", "陌生人"],
          startedAt: Date.now(),
          edits: 1,
          pastedChars: 0,
          saves: 1,
        },
      },
      user.token,
    );
    const storyId = result.analysis?.id;
    if (!storyId || result.status !== "pending_review") {
      throw new Error(`Expected pending_review, received ${result.status ?? "no status"}`);
    }

    const [{ data: story }, { data: review }, { data: notification }] = await Promise.all([
      service.from("stories").select("id,title,status,moderation_decision,published_at").eq("id", storyId).single(),
      service.from("review_cases").select("id,status,source,categories,reason").eq("story_id", storyId).single(),
      service.from("notifications").select("id,status,kind,reason,read").eq("story_id", storyId).single(),
    ]);
    if (story?.status !== "pending_review" || story.moderation_decision !== "human_review") {
      throw new Error("Story did not enter the pending human-review state.");
    }
    if (review?.status !== "pending" || review.source !== "machine") {
      throw new Error("The pending review case was not created.");
    }
    if (!Array.isArray(review.categories) || !review.categories.includes("privacy")) {
      throw new Error(
        `The model did not explicitly classify the synthetic privacy sample; categories=${JSON.stringify(review.categories ?? [])}`,
      );
    }
    if (notification?.status !== "pending" || notification.reason !== EXPECTED_PENDING_COPY) {
      throw new Error(`Unexpected pending notification copy: ${notification?.reason ?? "missing"}`);
    }

    const userInbox = await call("notifications", null, user.token, "GET");
    if (!userInbox.notifications?.some((item) => item.story_id === storyId && item.reason === EXPECTED_PENDING_COPY)) {
      throw new Error("The user notifications endpoint did not return the pending-review message.");
    }
    const dashboard = await call("admin-api", { action: "dashboard" }, admin.token);
    if (!dashboard.reviews?.some((item) => item.id === review.id && item.story_id === storyId)) {
      throw new Error("The admin dashboard payload did not contain the review case.");
    }
    const anonymous = createClient(config.url, config.publishableKey, { auth: { persistSession: false } });
    const { data: leaked } = await anonymous.from("stories").select("id").eq("id", storyId);
    if (leaked?.length) throw new Error("The pending story was visible through public RLS.");

    process.stdout.write(
      `${JSON.stringify(
        {
          userAccount,
          adminAccount,
          password: PASSWORD,
          storyId,
          reviewId: review.id,
          title,
          storyStatus: story.status,
          reviewStatus: review.status,
          notificationStatus: notification.status,
          notificationReason: notification.reason,
          adminDashboardVisible: true,
          publiclyVisibleBeforeApproval: false,
        },
        null,
        2,
      )}\n`,
    );
  } catch (error) {
    await cleanupAccounts(createdAccounts).catch(() => undefined);
    throw error;
  }
}

async function verifyApproved(userAccount, adminAccount) {
  const userProfile = await profile(userAccount);
  const adminProfile = await profile(adminAccount);
  if (!userProfile || !adminProfile) throw new Error("QA review-flow accounts were not found.");
  const { data: story, error: storyError } = await service
    .from("stories")
    .select("id,title,status,moderation_decision,published_at")
    .eq("user_id", userProfile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (storyError) throw storyError;
  const [{ data: review }, { data: notification }] = await Promise.all([
    service.from("review_cases").select("id,status,reviewer_id,decision_reason").eq("story_id", story.id).single(),
    service.from("notifications").select("status,kind,reason,read").eq("story_id", story.id).single(),
  ]);
  if (story.status !== "published" || story.moderation_decision !== "pass" || !story.published_at) {
    throw new Error(`Expected published/pass after approval, got ${story.status}/${story.moderation_decision}`);
  }
  if (review?.status !== "approved" || review.reviewer_id !== adminProfile.id) {
    throw new Error("The review case was not approved by the QA administrator.");
  }
  if (notification?.status !== "resolved" || notification.kind !== "kept") {
    throw new Error("The user did not receive the resolved approval notification.");
  }
  const userToken = await login(userAccount);
  const userInbox = await call("notifications", null, userToken, "GET");
  if (
    !userInbox.notifications?.some(
      (item) => item.story_id === story.id && item.status === "resolved" && item.kind === "kept",
    )
  ) {
    throw new Error("The resolved approval was not visible through the user notifications endpoint.");
  }
  const adminToken = await login(adminAccount);
  const dashboard = await call("admin-api", { action: "dashboard" }, adminToken);
  if (!dashboard.reviews?.some((item) => item.id === review.id && item.status === "approved")) {
    throw new Error("The approved record was not visible through the admin dashboard endpoint.");
  }
  const anonymous = createClient(config.url, config.publishableKey, { auth: { persistSession: false } });
  const { data: visible } = await anonymous.from("stories").select("id,status").eq("id", story.id).maybeSingle();
  if (!visible || visible.status !== "published") throw new Error("The approved story is still not publicly readable.");
  process.stdout.write(
    `${JSON.stringify(
      {
        storyId: story.id,
        storyStatus: story.status,
        moderationDecision: story.moderation_decision,
        reviewStatus: review.status,
        notificationStatus: notification.status,
        notificationKind: notification.kind,
        notificationReason: notification.reason,
        userInboxVisible: true,
        adminDashboardStatus: "approved",
        publiclyVisibleAfterApproval: true,
      },
      null,
      2,
    )}\n`,
  );
}

async function approve(userAccount, adminAccount) {
  const userProfile = await profile(userAccount);
  const adminProfile = await profile(adminAccount);
  if (!userProfile || !adminProfile || adminProfile.role !== "admin") {
    throw new Error("QA user or administrator account was not found.");
  }
  const { data: story, error: storyError } = await service
    .from("stories")
    .select("id,title,status")
    .eq("user_id", userProfile.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (storyError) throw storyError;
  const { data: review, error: reviewError } = await service
    .from("review_cases")
    .select("id,status")
    .eq("story_id", story.id)
    .single();
  if (reviewError) throw reviewError;
  if (story.status !== "pending_review" || review.status !== "pending") {
    throw new Error(`Expected pending story/review, got ${story.status}/${review.status}`);
  }
  const adminToken = await login(adminAccount);
  await call("admin-api", { action: "review-open", reviewId: review.id }, adminToken);
  const userToken = await login(userAccount);
  const reviewingInbox = await call("notifications", null, userToken, "GET");
  if (!reviewingInbox.notifications?.some((item) => item.story_id === story.id && item.status === "reviewing")) {
    throw new Error("Opening the admin review did not update the user notification to reviewing.");
  }
  const decisionReason = "QA 回归确认：允许公开";
  await call(
    "admin-api",
    { action: "review-decide", reviewId: review.id, decision: "approved", reason: decisionReason },
    adminToken,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        storyId: story.id,
        reviewId: review.id,
        openedByAdmin: true,
        userNotificationWhileReviewing: true,
        decision: "approved",
        decisionReason,
      },
      null,
      2,
    )}\n`,
  );
}

const [action = "setup", ...args] = process.argv.slice(2);
if (action === "setup") await setup();
else if (action === "approve") {
  if (args.length !== 2) throw new Error("Usage: approve <user-account> <admin-account>");
  await approve(args[0], args[1]);
} else if (action === "verify-approved") {
  if (args.length !== 2) throw new Error("Usage: verify-approved <user-account> <admin-account>");
  await verifyApproved(args[0], args[1]);
} else if (action === "cleanup") {
  if (args.length !== 2) throw new Error("Usage: cleanup <user-account> <admin-account>");
  process.stdout.write(`Cleaned ${await cleanupAccounts(args)} isolated QA account(s).\n`);
} else throw new Error(`Unknown action: ${action}`);
