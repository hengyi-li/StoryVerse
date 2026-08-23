import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { imageDimensions } from "./lib/image-dimensions.mjs";

function localSupabase() {
  const result = spawnSync("npx", ["supabase", "status", "-o", "json"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Could not read local Supabase status: ${result.stderr.trim()}`);
  const start = result.stdout.indexOf("{");
  const status = JSON.parse(result.stdout.slice(start));
  if (!String(status.API_URL).startsWith("http://127.0.0.1:")) {
    throw new Error("QA local E2E refuses to run against a non-local Supabase project.");
  }
  return {
    url: status.API_URL,
    publishableKey: status.PUBLISHABLE_KEY,
    secretKey: status.SECRET_KEY,
  };
}

const config = localSupabase();
const origin = "http://127.0.0.1:4173";
const service = createClient(config.url, config.secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const createdUserIds = [];
const checks = [];

function ok(name, detail = "") {
  checks.push({ name, detail });
  process.stdout.write(`✓ ${name}${detail ? ` — ${detail}` : ""}\n`);
}

async function callFunction(name, body, accessToken = config.publishableKey, method = "POST") {
  const response = await fetch(`${config.url}/functions/v1/${name}`, {
    method,
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: origin,
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`${name} returned ${response.status}: ${payload.error ?? "Unknown error"}`);
    error.status = response.status;
    error.code = payload.code;
    throw error;
  }
  return { payload, response };
}

async function waitForLocalImage(storyId, timeoutMs = 150_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await service
      .from("generated_images")
      .select("public_url,style,status,error")
      .eq("story_id", storyId)
      .maybeSingle();
    if (error) throw error;
    if (data?.status === "ready" && data.public_url) {
      return { imageUrl: String(data.public_url), imageStyle: String(data.style) };
    }
    if (data?.status === "failed") throw new Error(`Background image generation failed: ${data.error}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Background image generation did not finish within ${timeoutMs}ms.`);
}

async function expectFunctionError(name, body, expectedCode, accessToken = config.publishableKey) {
  try {
    await callFunction(name, body, accessToken);
  } catch (error) {
    if (error.code === expectedCode) return;
    throw error;
  }
  throw new Error(`${name} should have failed with ${expectedCode}`);
}

async function signup(username, displayName, password, securityAnswer) {
  const { payload } = await callFunction("auth-signup", {
    accountIdentifier: username,
    displayName,
    password,
    passwordConfirmation: password,
    securityQuestion: "first_school",
    securityAnswer,
  });
  if (!payload.session?.access_token || !payload.user?.id) throw new Error("Signup did not return a session and user.");
  createdUserIds.push(payload.user.id);
  return { profile: payload.user, session: payload.session };
}

function vector(primary, secondary = 0) {
  const values = Array.from({ length: 1024 }, (_, index) => (index === 0 ? primary : index === 1 ? secondary : 0));
  return `[${values.join(",")}]`;
}

const suffix = Date.now().toString(36).slice(-7);
const usernameA = `qa_a_${suffix}`.slice(0, 20);
const usernameB = `qa_b_${suffix}`.slice(0, 20);
const passwordA = "StoryVerse-QA-2026!";
const recoveredPassword = "StoryVerse-QA-New-2026!";
const passwordB = "StoryVerse-QA-Second!";
const resetPasswordB = "StoryVerse-QA-Reset-2026!";
const securityAnswer = "qa-school";
const qaSeedExternalId = `qa-seed-${suffix}`;
let imagePath = "";

try {
  await expectFunctionError(
    "auth-signup",
    {
      accountIdentifier: "bad name",
      displayName: "错误账号",
      password: passwordA,
      passwordConfirmation: passwordA,
      securityQuestion: "first_school",
      securityAnswer,
    },
    "INVALID_USERNAME",
  );
  ok("注册字段校验");

  const userA = await signup(usernameA, "QA 星旅人 A", passwordA, securityAnswer);
  const userB = await signup(usernameB, "QA 星旅人 B", passwordB, "qa-answer-b");
  ok("开放注册与 Supabase Auth 会话", "2 个隔离测试账号");

  await expectFunctionError(
    "auth-login",
    { accountIdentifier: usernameA, password: "definitely-wrong" },
    "INVALID_CREDENTIALS",
  );
  const loginA = await callFunction("auth-login", { accountIdentifier: usernameA, password: passwordA });
  let tokenA = loginA.payload.session.access_token;
  let tokenB = userB.session.access_token;
  ok("登录成功与错误密码统一提示");

  await expectFunctionError(
    "auth-recover",
    {
      accountIdentifier: usernameA,
      securityQuestion: "first_school",
      securityAnswer: "wrong-answer",
      password: recoveredPassword,
      passwordConfirmation: recoveredPassword,
    },
    "RECOVERY_FAILED",
  );
  await callFunction("auth-recover", {
    accountIdentifier: usernameA,
    securityQuestion: "first_school",
    securityAnswer,
    password: recoveredPassword,
    passwordConfirmation: recoveredPassword,
  });
  const recoveredLogin = await callFunction("auth-login", {
    accountIdentifier: usernameA,
    password: recoveredPassword,
  });
  tokenA = recoveredLogin.payload.session.access_token;
  ok("密保找回密码", "错误答案被拒绝，正确答案可更新密码");

  const draft = {
    guide: "一次重要的选择",
    customGuide: "",
    title: "第一次独立完成公开分享",
    body: "那是一个很普通的周末，我决定独自完成一项一直拖延的社区分享。准备过程中，我认真核对资料，也主动请朋友指出表达不清的地方。站上台前时我仍有些紧张，但看到听众认真回应，我逐渐放松下来。结束后，我们一起整理了可以继续改进的建议。这段经历没有戏剧性的转折，却让我理解到，耐心准备、诚实交流和接受反馈，本身就是成长的一部分。后来再面对陌生任务时，我会想起那天，并提醒自己先迈出能够完成的一小步。",
    age: "24",
    gender: "女",
    stage: "成年早期",
    city: "上海",
    cityLat: 31.2304,
    cityLon: 121.4737,
    cityNameEn: "Shanghai",
    cityCountry: "China",
    mood: "平和自足",
    people: ["自己", "朋友"],
    startedAt: Date.now(),
    edits: 1,
    pastedChars: 0,
    saves: 1,
  };

  await expectFunctionError("story-analyze", { draft: { ...draft, body: "太短" } }, "INVALID_STORY_LENGTH", tokenA);
  await callFunction("story-save-draft", { draft }, tokenA);
  const { data: savedDraft, error: draftError } = await service
    .from("story_drafts")
    .select("id,body")
    .eq("user_id", userA.profile.id)
    .single();
  if (draftError || savedDraft.body !== draft.body) throw draftError ?? new Error("Draft did not persist.");
  ok("草稿持久化与正文长度边界");

  const analysisCall = await callFunction("story-analyze", { draft }, tokenA);
  const analysis = analysisCall.payload.analysis;
  if (!analysis?.id || !analysis.storyTags?.eventType?.value || analysis.storyTags.themes?.length !== 2) {
    throw new Error("Story analysis did not return a type and exactly two themes.");
  }
  ok("真实 AI 安全审核、21 类识别与双主题", String(analysis.workflowStatus));

  const confirmCall = await callFunction(
    "story-confirm",
    {
      storyId: analysis.id,
      draft,
      typeId: analysis.storyTags.eventType.value,
      themes: analysis.storyTags.themes.map((theme) => theme.value),
      emotions: analysis.storyTags.emotions ?? [],
    },
    tokenA,
  );
  let storyStatus = confirmCall.payload.status;

  await service.from("profiles").update({ role: "admin" }).eq("id", userA.profile.id);
  if (storyStatus === "pending_review") {
    const { data: review, error: reviewError } = await service
      .from("review_cases")
      .select("id")
      .eq("story_id", analysis.id)
      .in("status", ["pending", "reviewing"])
      .single();
    if (reviewError) throw reviewError;
    await callFunction("admin-api", { action: "review-open", reviewId: review.id }, tokenA);
    await callFunction(
      "admin-api",
      { action: "review-decide", reviewId: review.id, decision: "approved", reason: "QA 安全故事复核通过" },
      tokenA,
    );
    storyStatus = "published";
  }
  if (storyStatus !== "published") throw new Error(`Expected a published story, got ${storyStatus}`);
  const { data: publishedStory, error: publishedError } = await service
    .from("stories")
    .select("id,status,final_type_id,final_themes,moderation_decision")
    .eq("id", analysis.id)
    .single();
  if (publishedError || publishedStory.final_themes.length !== 2 || publishedStory.moderation_decision !== "pass") {
    throw publishedError ?? new Error("Confirmed story is missing final labels.");
  }
  ok("故事确认、人工兜底与公开状态", publishedStory.status);

  const dashboard = await callFunction("admin-api", { action: "dashboard" }, tokenA);
  if (!Array.isArray(dashboard.payload.users) || !Array.isArray(dashboard.payload.stories)) {
    throw new Error("Admin dashboard payload is incomplete.");
  }
  await expectFunctionError("admin-api", { action: "dashboard" }, "ADMIN_REQUIRED", tokenB);
  ok("管理员服务端角色校验", "普通用户被拒绝");

  const originalType = dashboard.payload.types[0];
  const temporaryColor = String(originalType.color).toUpperCase() === "#123456" ? "#654321" : "#123456";
  await callFunction("admin-api", { action: "type-update", typeId: originalType.id, color: temporaryColor }, tokenA);
  const { data: changedType, error: changedTypeError } = await service
    .from("story_types")
    .select("color")
    .eq("id", originalType.id)
    .single();
  if (changedTypeError || String(changedType.color).toUpperCase() !== temporaryColor) {
    throw changedTypeError ?? new Error("Story type color update did not persist.");
  }
  await callFunction(
    "admin-api",
    { action: "type-update", typeId: originalType.id, color: originalType.color },
    tokenA,
  );
  await callFunction(
    "admin-api",
    { action: "types-reorder", orderedIds: dashboard.payload.types.map((type) => type.id) },
    tokenA,
  );
  ok("故事类型颜色与 21 类排序配置", "测试后已恢复原颜色");

  const weights = { city: 0.15, life: 0.25, theme: 0.25, semantic: 0.35, age: 0.5, stage: 0.3, gender: 0.2 };
  await expectFunctionError(
    "admin-api",
    { action: "config-save-draft", weights: { ...weights, semantic: 0.5 } },
    "INVALID_WEIGHT_TOTAL",
    tokenA,
  );
  const draftConfig = await callFunction("admin-api", { action: "config-save-draft", weights }, tokenA);
  const configId = draftConfig.payload.config?.id;
  if (!configId) throw new Error("Recommendation config draft was not created.");
  const publishedConfig = await callFunction("admin-api", { action: "config-publish", configId }, tokenA);
  if (publishedConfig.payload.config?.status !== "published") {
    throw new Error("Recommendation config draft was not published.");
  }
  ok("推荐权重草稿、校验与发布版本");

  await callFunction(
    "admin-api",
    { action: "account-status", profileId: userB.profile.id, status: "suspended" },
    tokenA,
  );
  await expectFunctionError("auth-login", { accountIdentifier: usernameB, password: passwordB }, "INVALID_CREDENTIALS");
  await callFunction("admin-api", { action: "account-status", profileId: userB.profile.id, status: "active" }, tokenA);
  await callFunction("auth-login", { accountIdentifier: usernameB, password: passwordB });
  await callFunction(
    "admin-api",
    { action: "account-reset-password", profileId: userB.profile.id, password: resetPasswordB },
    tokenA,
  );
  const resetLogin = await callFunction("auth-login", { accountIdentifier: usernameB, password: resetPasswordB });
  tokenB = resetLogin.payload.session.access_token;
  ok("账号停用、恢复与管理员重置密码");

  const candidateBody =
    "搬到新的城市以后，我参加了社区图书馆的志愿活动。最初我只负责整理书架，后来逐渐认识了不同年龄的伙伴。大家会分享最近读到的书，也会耐心听我讲刚来这里时的不适应。几个月后，我已经能够主动帮助新加入的人熟悉环境。这个过程让我发现，归属感并不总是突然出现，它往往来自一次次普通的问候、合作和相互记住。";
  const { data: candidate, error: candidateError } = await service
    .from("stories")
    .insert({
      user_id: userB.profile.id,
      author_display_name: "QA 星旅人 B",
      title: "在新城市找到熟悉感",
      body: candidateBody,
      excerpt: candidateBody.slice(0, 70),
      mood: "开心幸福",
      life_stage: "成年早期",
      age: 27,
      gender: "女",
      city: "杭州",
      latitude: 30.2741,
      longitude: 120.1551,
      people: ["自己", "陌生人"],
      status: "published",
      moderation_decision: "pass",
      ai_type_id: "relocation_or_immigration",
      final_type_id: "relocation_or_immigration",
      ai_themes: ["城市归属", "互助"],
      final_themes: ["城市归属", "互助"],
      content_hash: `qa-candidate-${suffix}`,
      published_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (candidateError) throw candidateError;

  const { data: referenceEmbedding, error: embeddingReadError } = await service
    .from("story_embeddings")
    .select("model,model_version")
    .eq("story_id", analysis.id)
    .single();
  if (embeddingReadError) throw embeddingReadError;
  const { error: embeddingInsertError } = await service.from("story_embeddings").insert({
    story_id: candidate.id,
    story_embedding: vector(0.98, 0.02),
    theme_embedding: vector(0.95, 0.05),
    model: referenceEmbedding.model,
    model_version: referenceEmbedding.model_version,
    content_hash: `qa-candidate-${suffix}`,
    theme_hash: `qa-theme-${suffix}`,
  });
  if (embeddingInsertError) throw embeddingInsertError;

  const refresh = await callFunction("recommendations-refresh", {}, tokenA);
  if (!refresh.payload.batchId || refresh.payload.recommendations.length > 5) {
    throw new Error("Recommendation refresh did not return a valid Top 5 batch response.");
  }
  const { data: candidateResult, error: candidateResultError } = await service
    .from("recommendation_results")
    .select("rank")
    .eq("batch_id", refresh.payload.batchId)
    .eq("story_id", candidate.id)
    .maybeSingle();
  if (candidateResultError || !candidateResult) {
    throw candidateResultError ?? new Error("Eligible candidate story was missing from the Top 100 batch.");
  }
  const lobby = await callFunction("lobby-stories", {}, tokenA);
  const lobbyCandidate = lobby.payload.recommendations.find((item) => item.story?.id === candidate.id);
  if (!lobbyCandidate) {
    throw new Error("Lobby did not return the recommendation batch.");
  }
  if (Number(lobbyCandidate.story.latitude) !== 30.2741 || Number(lobbyCandidate.story.longitude) !== 120.1551) {
    throw new Error("Lobby recommendation payload lost the story coordinates.");
  }
  ok("推荐公式、批次与 StarLobby Top 结果");

  await callFunction("reactions", { storyId: candidate.id, value: "like" }, tokenA);
  const report = await callFunction(
    "reports",
    { storyId: candidate.id, reason: "其他", note: "QA 举报链路验证" },
    tokenA,
  );
  if (!report.payload.report?.id) throw new Error("Report was not created.");
  const dashboardAfterReport = await callFunction("admin-api", { action: "dashboard" }, tokenA);
  const reportReview = dashboardAfterReport.payload.reviews.find(
    (row) => row.story_id === candidate.id && row.source === "report",
  );
  if (!reportReview) throw new Error("Reported story did not enter the admin review queue.");
  await callFunction("admin-api", { action: "review-open", reviewId: reportReview.id }, tokenA);
  await callFunction(
    "admin-api",
    { action: "review-decide", reviewId: reportReview.id, decision: "approved", reason: "QA 举报复核：允许公开" },
    tokenA,
  );
  await callFunction(
    "admin-api",
    { action: "story-status", storyId: candidate.id, status: "removed", reason: "QA 下架与恢复验证" },
    tokenA,
  );
  const { data: removedStory, error: removedStoryError } = await service
    .from("stories")
    .select("status")
    .eq("id", candidate.id)
    .single();
  if (removedStoryError || removedStory.status !== "removed") {
    throw removedStoryError ?? new Error("Story removal did not persist.");
  }
  await callFunction("admin-api", { action: "story-status", storyId: candidate.id, status: "published" }, tokenA);
  ok("喜欢、举报、人工审核与故事下架恢复闭环");

  await callFunction("feedback", { text: "QA 自动化反馈链路验证", category: "qa" }, tokenB);
  const feedbackDashboard = await callFunction("admin-api", { action: "dashboard" }, tokenA);
  if (!feedbackDashboard.payload.feedback.some((item) => item.text === "QA 自动化反馈链路验证")) {
    throw new Error("Feedback did not appear in the admin dashboard.");
  }
  ok("用户反馈进入管理员后台");

  const places = await callFunction("places-search", { query: "Reykjavik", language: "en" }, tokenA);
  if (
    !Array.isArray(places.payload.places) ||
    !places.payload.places.some(
      (place) =>
        place.lat != null &&
        place.lon != null &&
        Number.isFinite(Number(place.lat)) &&
        Number.isFinite(Number(place.lon)),
    )
  ) {
    throw new Error("Remote place search did not return real coordinates.");
  }
  const ipHint = await callFunction("places-ip-hint", {}, tokenA);
  if (!("place" in ipHint.payload)) throw new Error("IP hint returned an invalid shape.");
  ok("服务端全球城市搜索返回真实坐标，IP 提示可安全降级");

  const seedRow = {
    external_id: qaSeedExternalId,
    title: "QA 冷启动故事",
    body: candidateBody,
    age: "31",
    gender: "男",
    stage: "成年早期",
    city: "南京",
    latitude: "32.0603",
    longitude: "118.7969",
    mood: "平和自足",
    people: "自己|朋友",
    source_note: "QA 已授权测试故事",
    skip_moderation: "true",
  };
  const seedImport = await callFunction(
    "admin-api",
    { action: "seed-import", filename: "qa-seed.csv", rows: [seedRow] },
    tokenA,
  );
  if (seedImport.payload.imported !== 1 || seedImport.payload.failed !== 0) {
    throw new Error("Valid seed import did not succeed.");
  }
  const duplicateImport = await callFunction(
    "admin-api",
    { action: "seed-import", filename: "qa-seed-duplicate.csv", rows: [seedRow] },
    tokenA,
  );
  if (duplicateImport.payload.imported !== 0 || duplicateImport.payload.failed !== 0) {
    throw new Error("Duplicate external_id was not skipped idempotently.");
  }
  ok("冷启动 CSV 导入与 external_id 去重");

  if (process.env.QA_SKIP_IMAGE !== "1") {
    await expectFunctionError(
      "story-generate-image",
      { storyId: analysis.id, style: "watercolor" },
      "INVALID_IMAGE_STYLE",
      tokenA,
    );
    await expectFunctionError(
      "story-generate-image",
      { storyId: "00000000-0000-0000-0000-000000000001", style: "clay-3d" },
      "STORY_NOT_FOUND",
      tokenA,
    );
    await expectFunctionError(
      "story-generate-image",
      { storyId: candidate.id, style: "clay-3d" },
      "STORY_NOT_FOUND",
      tokenA,
    );
    const { error: blockCandidateError } = await service
      .from("stories")
      .update({ moderation_decision: null })
      .eq("id", candidate.id);
    if (blockCandidateError) throw blockCandidateError;
    await expectFunctionError(
      "story-generate-image",
      { storyId: candidate.id, style: "clay-3d" },
      "IMAGE_BLOCKED",
      tokenB,
    );
    const { error: restoreCandidateError } = await service
      .from("stories")
      .update({ moderation_decision: "pass" })
      .eq("id", candidate.id);
    if (restoreCandidateError) throw restoreCandidateError;
    ok("图片接口输入、归属与审核状态边界");

    const imageInitiationStartedAt = performance.now();
    const imageInitiation = await callFunction(
      "story-generate-image",
      { storyId: analysis.id, style: "clay-3d" },
      tokenA,
    );
    const imageInitiationDurationMs = Math.round(performance.now() - imageInitiationStartedAt);
    if (imageInitiation.payload.status !== "generating" || imageInitiationDurationMs > 7_000) {
      throw new Error(`Image request did not queue quickly (${imageInitiationDurationMs}ms).`);
    }
    const generatedImage = { payload: await waitForLocalImage(analysis.id) };
    if (!String(generatedImage.payload.imageUrl).includes("/storage/v1/object/public/story-images/")) {
      throw new Error("Generated image was not stored in Supabase Storage.");
    }
    const { data: initialImageRecord, error: initialImageError } = await service
      .from("generated_images")
      .select("storage_path")
      .eq("story_id", analysis.id)
      .eq("status", "ready")
      .single();
    if (initialImageError) throw initialImageError;
    imagePath = initialImageRecord.storage_path;
    const imageResponse = await fetch(generatedImage.payload.imageUrl);
    if (!imageResponse.ok) throw new Error(`Stored image is not publicly readable (${imageResponse.status}).`);
    const dimensions = imageDimensions(await imageResponse.arrayBuffer());
    if (dimensions.width !== dimensions.height) {
      throw new Error(`Generated image is not 1:1 (${dimensions.width}x${dimensions.height}).`);
    }
    const repeatedImage = await callFunction(
      "story-generate-image",
      { storyId: analysis.id, style: "clay-3d" },
      tokenA,
    );
    const changedStyle = await callFunction(
      "story-generate-image",
      { storyId: analysis.id, style: "retro-collage" },
      tokenA,
    );
    if (
      repeatedImage.payload.reused !== true ||
      changedStyle.payload.reused !== true ||
      repeatedImage.payload.imageUrl !== generatedImage.payload.imageUrl ||
      changedStyle.payload.imageUrl !== generatedImage.payload.imageUrl ||
      changedStyle.payload.imageStyle !== "clay-3d"
    ) {
      throw new Error("Repeated image requests did not reuse the selected image.");
    }
    const { data: imageRecords, error: imageError } = await service
      .from("generated_images")
      .select("storage_path,status")
      .eq("story_id", analysis.id)
      .eq("status", "ready");
    if (imageError) throw imageError;
    if (imageRecords.length !== 1) throw new Error(`Expected one selected image, found ${imageRecords.length}.`);
    imagePath = imageRecords[0].storage_path;
    const { count: attemptCount, error: attemptError } = await service
      .from("image_generation_attempts")
      .select("id", { count: "exact", head: true })
      .eq("story_id", analysis.id);
    if (attemptError) throw attemptError;
    if (attemptCount !== 1) throw new Error(`Repeated requests triggered ${attemptCount} model attempts.`);
    ok(
      "Seedream 后台图片生成、1:1 尺寸与 Storage 保存",
      `${dimensions.width}×${dimensions.height} · 入队 ${imageInitiationDurationMs}ms`,
    );
    ok("每篇故事只生成并选定一张图片", "重复请求与切换风格均复用原图");

    const editedDraft = { ...draft, title: `${draft.title}（修订）` };
    await callFunction(
      "story-confirm",
      {
        storyId: analysis.id,
        draft: editedDraft,
        typeId: publishedStory.final_type_id,
        themes: publishedStory.final_themes,
        emotions: analysis.storyTags.emotions ?? [],
      },
      tokenA,
    );
    const { count: invalidatedImageCount, error: invalidatedImageError } = await service
      .from("generated_images")
      .select("id", { count: "exact", head: true })
      .eq("story_id", analysis.id);
    if (invalidatedImageError) throw invalidatedImageError;
    if (invalidatedImageCount !== 0) throw new Error("Editing story content did not invalidate its selected image.");
    const { error: deletedObjectError } = await service.storage.from("story-images").download(imagePath);
    if (!deletedObjectError) throw new Error("Editing story content did not remove its Storage object.");
    imagePath = "";
    ok("修改标题或正文后图片失效", "数据库记录与 Storage 文件均删除");
  }

  const notifications = await callFunction("notifications", undefined, tokenA, "GET");
  if (!Array.isArray(notifications.payload.notifications)) throw new Error("Notifications response is invalid.");
  await callFunction("notifications", { all: true }, tokenA);
  ok("站内通知读取与已读状态");

  process.stdout.write(`\nQA local E2E passed: ${checks.length} checkpoints.\n`);
} finally {
  if (imagePath) await service.storage.from("story-images").remove([imagePath]);
  await service.from("stories").delete().eq("external_id", qaSeedExternalId);
  if (createdUserIds.length) {
    await service.from("recommendation_batches").delete().in("user_id", createdUserIds);
    await service.from("algorithm_configs").delete().in("created_by", createdUserIds);
    await service.from("import_batches").delete().in("created_by", createdUserIds);
    await service.from("admin_audit_logs").delete().in("admin_id", createdUserIds);
  }
  for (const userId of createdUserIds.reverse()) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) process.stderr.write(`QA cleanup warning (test user): ${error.message}\n`);
  }
}
