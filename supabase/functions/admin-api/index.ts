import { analyzeStoryWithArk, arkModelInfo, createEmbedding } from "../_shared/ark.ts";
import { sha256 } from "../_shared/crypto.ts";
import { ApiError, json, readJson, serve } from "../_shared/http.ts";
import { normalizeDraftShape, storyContentHash } from "../_shared/story-data.ts";
import { POSTTEST_ITEM_IDS } from "../_shared/posttest.ts";
import { archiveQueueMessage, processStoryAnalysis } from "../_shared/story-pipeline.ts";
import { generateSeedStoryImage, SEED_IMAGE_STYLES, type SeedImageStyle } from "../_shared/seed-image.ts";
import { adminClient, requireAdmin } from "../_shared/supabase.ts";
import { isStoryTypeId, type StoryTypeId } from "../_shared/story-types.ts";
import {
  SEED_STORY_BODY_MAX_LENGTH,
  validateDraft,
  validatePassword,
  type StoryDraftInput,
} from "../_shared/validation.ts";

async function audit(
  admin: ReturnType<typeof adminClient>,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: unknown = {},
) {
  await admin.from("admin_audit_logs").insert({
    admin_id: adminId,
    action,
    target_type: targetType,
    target_id: targetId,
    details,
  });
}

async function dashboard(admin: ReturnType<typeof adminClient>) {
  const [reviews, users, stories, tasks, feedback, types, configs, imports, failures, analytics] = await Promise.all([
    admin
      .from("review_cases")
      .select(
        "*,story:stories(*),author:profiles!review_cases_author_id_fkey(display_name,username),reports(reason,note)",
      )
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(200),
    admin
      .from("profiles")
      .select("id,username,display_name,anonymous_number,role,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("stories")
      .select("*,author:profiles!stories_user_id_fkey(username,display_name)")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("ai_tasks").select("*").order("created_at", { ascending: false }).limit(200),
    admin
      .from("feedback")
      .select("*,profile:profiles(display_name,username)")
      .order("created_at", { ascending: false })
      .limit(200),
    admin.from("story_types").select("*").order("sort_order"),
    admin.from("algorithm_configs").select("*").order("version", { ascending: false }),
    admin.from("import_batches").select("*").order("created_at", { ascending: false }).limit(100),
    admin.from("import_failures").select("*").order("created_at", { ascending: false }).limit(200),
    admin.rpc("analytics_dashboard", {
      p_start: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString(),
      p_end: new Date().toISOString(),
    }),
  ]);
  for (const result of [reviews, users, stories, tasks, feedback, types, configs, imports, failures, analytics])
    if (result.error) throw result.error;
  return {
    reviews: reviews.data ?? [],
    users: users.data ?? [],
    stories: stories.data ?? [],
    tasks: tasks.data ?? [],
    feedback: feedback.data ?? [],
    types: types.data ?? [],
    configs: configs.data ?? [],
    imports: imports.data ?? [],
    failures: failures.data ?? [],
    analytics: analytics.data ?? {},
  };
}

const analyticsModules = new Set([
  "acquisition",
  "creation",
  "discovery",
  "reading",
  "resonance",
  "guidance",
  "account",
]);

async function analyticsQuery(admin: ReturnType<typeof adminClient>, input: Record<string, unknown>) {
  const end = input.end ? new Date(String(input.end)) : new Date();
  const start = input.start ? new Date(String(input.start)) : new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) {
    throw new ApiError(400, "INVALID_ANALYTICS_RANGE", "请选择有效的实验数据时间范围。");
  }
  if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
    throw new ApiError(400, "ANALYTICS_RANGE_TOO_LARGE", "单次最多查看 366 天实验数据。");
  }
  const priority = String(input.priority ?? "").trim();
  if (priority && !["P0", "P1", "P2"].includes(priority)) {
    throw new ApiError(400, "INVALID_ANALYTICS_PRIORITY", "实验事件优先级不正确。");
  }
  const module = String(input.module ?? "").trim();
  if (module && !analyticsModules.has(module)) {
    throw new ApiError(400, "INVALID_ANALYTICS_MODULE", "实验行为模块不正确。");
  }

  const account = String(input.account ?? "")
    .trim()
    .toLowerCase();
  let userId: string | null = null;
  if (account) {
    if (!/^[a-z0-9_]{4,20}$/.test(account)) {
      throw new ApiError(400, "INVALID_ANALYTICS_ACCOUNT", "请输入完整的登录账号。");
    }
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", account)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new ApiError(404, "ANALYTICS_ACCOUNT_NOT_FOUND", "没有找到这个登录账号。");
    userId = profile.id;
  }

  const { data, error } = await admin.rpc("analytics_dashboard", {
    p_start: start.toISOString(),
    p_end: end.toISOString(),
    p_user_id: userId,
    p_priority: priority || null,
    p_module: module || null,
  });
  if (error) throw error;
  return data ?? {};
}

const pretestStatuses = new Set(["not_required", "not_started", "in_progress", "completed", "declined"]);

async function pretestQuery(admin: ReturnType<typeof adminClient>, input: Record<string, unknown>) {
  const account = String(input.account ?? "")
    .trim()
    .toLowerCase();
  const status = String(input.status ?? "").trim();
  const start = input.start ? new Date(String(input.start)) : null;
  const end = input.end ? new Date(String(input.end)) : null;
  if (status && !pretestStatuses.has(status)) {
    throw new ApiError(400, "INVALID_PRETEST_STATUS", "前测状态筛选值不正确。");
  }
  if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime()))) {
    throw new ApiError(400, "INVALID_PRETEST_DATE", "前测时间范围不正确。");
  }
  let query = admin
    .from("profiles")
    .select("id,username,display_name,role,pretest_required,created_at,pretest_responses(*)")
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (account) query = query.ilike("username", `%${account.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? [])
    .map((profile) => {
      const nested = Array.isArray(profile.pretest_responses)
        ? profile.pretest_responses[0]
        : profile.pretest_responses;
      const response = (nested ?? {}) as Record<string, unknown>;
      const computedStatus =
        profile.pretest_required === false ? "not_required" : response.status ? String(response.status) : "not_started";
      return {
        user_id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        pretest_required: profile.pretest_required,
        account_created_at: profile.created_at,
        status: computedStatus,
        current_step: response.current_step ?? (computedStatus === "not_started" ? 1 : null),
        questionnaire_version: response.questionnaire_version ?? "pretest_v1",
        consented: response.consented ?? null,
        birth_year: response.birth_year ?? null,
        gender: response.gender ?? null,
        residence_region: response.residence_region ?? null,
        country_region: response.country_region ?? null,
        province: response.province ?? null,
        city: response.city ?? null,
        community_type: response.community_type ?? null,
        ethnicity: response.ethnicity ?? null,
        education: response.education ?? null,
        education_other: response.education_other ?? null,
        employment: response.employment ?? null,
        industry_primary: response.industry_primary ?? null,
        industry_secondary: response.industry_secondary ?? null,
        discipline: response.discipline ?? null,
        major: response.major ?? null,
        consented_at: response.consented_at ?? null,
        submitted_at: response.submitted_at ?? null,
        declined_at: response.declined_at ?? null,
        updated_at: response.updated_at ?? null,
      };
    })
    .filter((row) => !status || row.status === status)
    .filter((row) => {
      const timestamp = row.submitted_at || row.declined_at || row.updated_at || row.account_created_at;
      const time = new Date(String(timestamp)).getTime();
      return (!start || time >= start.getTime()) && (!end || time <= end.getTime());
    });
}

const posttestStatuses = new Set(["not_required", "not_started", "in_progress", "completed"]);

async function posttestQuery(admin: ReturnType<typeof adminClient>, input: Record<string, unknown>) {
  const account = String(input.account ?? "")
    .trim()
    .toLowerCase();
  const status = String(input.status ?? "").trim();
  const start = input.start ? new Date(String(input.start)) : null;
  const end = input.end ? new Date(String(input.end)) : null;
  if (status && !posttestStatuses.has(status)) {
    throw new ApiError(400, "INVALID_POSTTEST_STATUS", "后测状态筛选值不正确。");
  }
  if ((start && !Number.isFinite(start.getTime())) || (end && !Number.isFinite(end.getTime()))) {
    throw new ApiError(400, "INVALID_POSTTEST_DATE", "后测时间范围不正确。");
  }
  const { data, error } = await admin
    .from("profiles")
    .select(
      "id,username,display_name,role,pretest_required,created_at,pretest_responses(status,questionnaire_version),posttest_responses(*)",
    )
    .eq("role", "user")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return (data ?? [])
    .map((profile) => {
      const nestedPretest = Array.isArray(profile.pretest_responses)
        ? profile.pretest_responses[0]
        : profile.pretest_responses;
      const nestedPosttest = Array.isArray(profile.posttest_responses)
        ? profile.posttest_responses[0]
        : profile.posttest_responses;
      const pretest = (nestedPretest ?? {}) as Record<string, unknown>;
      const response = (nestedPosttest ?? {}) as Record<string, unknown>;
      const eligible =
        profile.pretest_required === true &&
        pretest.status === "completed" &&
        pretest.questionnaire_version === "pretest_v1";
      const computedStatus = eligible ? String(response.status ?? "not_started") : "not_required";
      const answers =
        response.answers && typeof response.answers === "object" && !Array.isArray(response.answers)
          ? (response.answers as Record<string, unknown>)
          : {};
      return {
        user_id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        posttest_required: eligible,
        account_created_at: profile.created_at,
        status: computedStatus,
        current_step: response.current_step ?? (computedStatus === "not_started" ? 1 : null),
        questionnaire_version: response.questionnaire_version ?? "posttest_v1",
        reminder_dismissed_at: response.reminder_dismissed_at ?? null,
        submitted_at: response.submitted_at ?? null,
        updated_at: response.updated_at ?? null,
        ...Object.fromEntries(POSTTEST_ITEM_IDS.map((itemId) => [itemId, answers[itemId] ?? null])),
      };
    })
    .filter(
      (row) =>
        !account ||
        String(row.username ?? "")
          .toLowerCase()
          .includes(account) ||
        String(row.display_name ?? "")
          .toLowerCase()
          .includes(account),
    )
    .filter((row) => !status || row.status === status)
    .filter((row) => {
      const timestamp = row.submitted_at || row.updated_at || row.account_created_at;
      const time = new Date(String(timestamp)).getTime();
      return (!start || time >= start.getTime()) && (!end || time <= end.getTime());
    });
}

async function approveStory(admin: ReturnType<typeof adminClient>, story: Record<string, unknown>) {
  let typeId = String(story.final_type_id || story.ai_type_id || "");
  let themes =
    Array.isArray(story.final_themes) && story.final_themes.length === 2
      ? story.final_themes.map(String)
      : Array.isArray(story.ai_themes)
        ? story.ai_themes.map(String)
        : [];
  if (!isStoryTypeId(typeId) || themes.length !== 2) {
    const { data: enabledTypes } = await admin.from("story_types").select("id").eq("enabled", true).order("sort_order");
    const result = await analyzeStoryWithArk({
      title: String(story.title ?? ""),
      body: String(story.body ?? ""),
      city: String(story.city ?? ""),
      age: Number(story.age),
      gender: String(story.gender ?? ""),
      lifeStage: String(story.life_stage ?? ""),
      allowedTypeIds: (enabledTypes ?? []).map((type) => type.id) as StoryTypeId[],
    });
    typeId = isStoryTypeId(typeId) ? typeId : result.labels.typeId;
    themes = themes.length === 2 ? themes : result.labels.themes;
  }
  const [storyEmbedding, themeEmbedding] = await Promise.all([
    createEmbedding(`${String(story.title ?? "")}\n${String(story.body ?? "")}`),
    createEmbedding(themes.join(" / ")),
  ]);
  const model = arkModelInfo().embedding;
  await admin.from("story_embeddings").upsert({
    story_id: story.id,
    story_embedding: storyEmbedding,
    theme_embedding: themeEmbedding,
    model,
    model_version: model,
    content_hash: story.content_hash,
    theme_hash: await sha256(themes.join("\u0000")),
    generated_at: new Date().toISOString(),
  });
  await admin
    .from("stories")
    .update({
      moderation_decision: "pass",
      moderation_categories: [],
      final_type_id: typeId,
      final_themes: themes,
      status: "published",
      published_at: new Date().toISOString(),
    })
    .eq("id", story.id);
}

async function seedProfile(admin: ReturnType<typeof adminClient>) {
  const { data: existing } = await admin.from("profiles").select("id").eq("username", "seed_stories").maybeSingle();
  if (existing) return String(existing.id);
  const { data, error } = await admin.auth.admin.createUser({
    email: "seed-stories@system.storyverse.invalid",
    password: `${crypto.randomUUID()}Seed!`,
    email_confirm: true,
    user_metadata: { system_account: true },
  });
  if (error || !data.user) throw error ?? new Error("Could not create the seed-story account");
  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    username: "seed_stories",
    display_name: "StoryVerse",
    anonymous_number: 100,
    role: "user",
    status: "active",
    pretest_required: false,
  });
  if (profileError) throw profileError;
  return data.user.id;
}

async function geocodeCity(city: string) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "zh");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error(`城市坐标查询失败 (${response.status})`);
  const result = ((await response.json()) as { results?: Array<Record<string, unknown>> }).results?.[0];
  if (!result) throw new Error("没有找到城市坐标");
  return {
    latitude: Number(result.latitude),
    longitude: Number(result.longitude),
    cityNameEn: String(result.name ?? city),
    cityCountry: String(result.country ?? ""),
  };
}

function recommendationWeights(value: unknown) {
  const weights = value as Record<string, unknown>;
  const keys = ["city", "life", "theme", "semantic", "age", "stage", "gender"];
  if (!weights || keys.some((key) => !Number.isFinite(Number(weights[key])))) {
    throw new ApiError(400, "INVALID_WEIGHTS", "推荐权重不完整。");
  }
  const normalized = Object.fromEntries(keys.map((key) => [key, Number(weights[key])])) as Record<string, number>;
  const totalScoreWeight = ["city", "life", "theme", "semantic"].reduce((sum, key) => sum + normalized[key], 0);
  const lifeScoreWeight = ["age", "stage", "gender"].reduce((sum, key) => sum + normalized[key], 0);
  if (
    keys.some((key) => normalized[key] < 0) ||
    Math.abs(totalScoreWeight - 1) > 0.0001 ||
    Math.abs(lifeScoreWeight - 1) > 0.0001
  ) {
    throw new ApiError(400, "INVALID_WEIGHT_TOTAL", "总分四项与人生分三项的权重必须分别加总为 1。");
  }
  return normalized;
}

serve(async (request) => {
  if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支持这个请求方式。");
  const { user } = await requireAdmin(request);
  const input = await readJson<Record<string, unknown>>(request);
  const action = String(input.action ?? "dashboard");
  const admin = adminClient();

  if (action === "dashboard") return json(request, await dashboard(admin));

  if (action === "analytics-query") return json(request, { analytics: await analyticsQuery(admin, input) });

  if (action === "pretest-query") return json(request, { responses: await pretestQuery(admin, input) });

  if (action === "pretest-export") {
    const responses = await pretestQuery(admin, input);
    await audit(admin, user.id, action, "pretest_responses", "filtered_export", {
      filters: {
        account: String(input.account ?? ""),
        status: String(input.status ?? ""),
        start: String(input.start ?? ""),
        end: String(input.end ?? ""),
      },
      rowCount: responses.length,
    });
    return json(request, { responses });
  }

  if (action === "posttest-query") return json(request, { responses: await posttestQuery(admin, input) });

  if (action === "posttest-export") {
    const responses = await posttestQuery(admin, input);
    await audit(admin, user.id, action, "posttest_responses", "filtered_export", {
      filters: {
        account: String(input.account ?? ""),
        status: String(input.status ?? ""),
        start: String(input.start ?? ""),
        end: String(input.end ?? ""),
      },
      rowCount: responses.length,
    });
    return json(request, { responses });
  }

  if (action === "analytics-timeline") {
    const participantKey = String(input.participantKey ?? "").trim();
    if (participantKey.length !== 64) {
      throw new ApiError(400, "INVALID_PARTICIPANT_KEY", "请输入完整的实验参与者键。");
    }
    const { data: events, error } = await admin
      .from("analytics_events")
      .select(
        "event_id,event_name,priority,occurred_at,page_id,route,session_id,lobby_view_id,recommendation_batch_id,properties",
      )
      .eq("participant_key", participantKey)
      .order("occurred_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return json(request, { events: events ?? [] });
  }

  if (action === "review-open") {
    const reviewId = String(input.reviewId ?? "");
    const { data: review, error } = await admin
      .from("review_cases")
      .update({ status: "reviewing", has_been_opened: true, reviewer_id: user.id })
      .eq("id", reviewId)
      .in("status", ["pending", "reviewing"])
      .select("*")
      .single();
    if (error || !review) throw new ApiError(404, "REVIEW_NOT_FOUND", "没有找到待处理的审核任务。");
    await admin.from("notifications").update({ status: "reviewing", read: false }).eq("review_case_id", reviewId);
    await audit(admin, user.id, action, "review_case", reviewId);
    return json(request, { review });
  }

  if (action === "review-decide") {
    const reviewId = String(input.reviewId ?? "");
    if (input.decision !== "approved" && input.decision !== "needs_edit") {
      throw new ApiError(400, "INVALID_REVIEW_DECISION", "请选择允许公开或需要修改。");
    }
    const decision = input.decision;
    const reason = String(input.reason ?? "").trim();
    if (decision === "needs_edit" && !reason) throw new ApiError(400, "REASON_REQUIRED", "请填写需要修改的原因。");
    const { data: review, error } = await admin
      .from("review_cases")
      .select("*,story:stories(*)")
      .eq("id", reviewId)
      .in("status", ["pending", "reviewing"])
      .single();
    if (error || !review?.story) throw new ApiError(404, "REVIEW_NOT_FOUND", "没有找到这条审核任务。");
    if (decision === "approved") await approveStory(admin, review.story as Record<string, unknown>);
    else await admin.from("stories").update({ status: "needs_edit", published_at: null }).eq("id", review.story_id);
    await admin
      .from("review_cases")
      .update({
        status: decision,
        reviewer_id: user.id,
        decision_reason: reason,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", reviewId);
    await admin
      .from("notifications")
      .update({
        status: "resolved",
        kind: decision === "approved" ? "kept" : "needs_edit",
        reason,
        read: false,
        created_at: new Date().toISOString(),
      })
      .eq("review_case_id", reviewId);
    await audit(admin, user.id, action, "review_case", reviewId, { decision, reason });
    return json(request, { updated: true });
  }

  if (action === "account-status") {
    const profileId = String(input.profileId ?? "");
    if (input.status !== "active" && input.status !== "suspended") {
      throw new ApiError(400, "INVALID_ACCOUNT_STATUS", "请选择启用或停用账号。");
    }
    const status = input.status;
    if (profileId === user.id && status === "suspended")
      throw new ApiError(400, "CANNOT_SUSPEND_SELF", "不能停用当前管理员账号。");
    const { data: updated, error } = await admin
      .from("profiles")
      .update({ status })
      .eq("id", profileId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "没有找到这个账号。");
    await audit(admin, user.id, action, "profile", profileId, { status });
    return json(request, { updated: true });
  }

  if (action === "account-reset-password") {
    const profileId = String(input.profileId ?? "");
    const password = validatePassword(input.password);
    const { data: profile } = await admin.from("profiles").select("id").eq("id", profileId).maybeSingle();
    if (!profile) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "没有找到这个账号。");
    const { error } = await admin.auth.admin.updateUserById(profileId, { password });
    if (error) throw error;
    await audit(admin, user.id, action, "profile", profileId);
    return json(request, { updated: true });
  }

  if (action === "story-status") {
    const storyId = String(input.storyId ?? "");
    if (input.status !== "published" && input.status !== "removed") {
      throw new ApiError(400, "INVALID_STORY_STATUS", "请选择下架或恢复故事。");
    }
    const { data: current, error: currentError } = await admin
      .from("stories")
      .select("status,status_before_removal,user_id,title,ai_suggested_title")
      .eq("id", storyId)
      .single();
    if (currentError || !current) throw new ApiError(404, "STORY_NOT_FOUND", "没有找到这篇故事。");
    const restoring = input.status === "published";
    const reason = String(input.reason ?? "").trim();
    if (!restoring && !reason) throw new ApiError(400, "REASON_REQUIRED", "请填写故事下架原因。");
    const status = restoring ? String(current.status_before_removal || "published") : "removed";
    const { error } = await admin
      .from("stories")
      .update({
        status,
        status_before_removal: restoring ? null : current.status,
        published_at: status === "published" ? new Date().toISOString() : null,
      })
      .eq("id", storyId);
    if (error) throw error;
    await admin.from("notifications").insert({
      user_id: current.user_id,
      story_id: storyId,
      status: "resolved",
      kind: restoring ? "system" : "removed",
      story_title: current.title || current.ai_suggested_title || "未命名故事",
      reason: restoring ? "故事已由管理员恢复。" : reason,
      read: false,
    });
    await audit(admin, user.id, action, "story", storyId, { status, reason });
    return json(request, { updated: true });
  }

  if (action === "seed-update") {
    const storyId = String(input.storyId ?? "");
    const { data: existing, error: existingError } = await admin
      .from("stories")
      .select("*")
      .eq("id", storyId)
      .eq("source_kind", "seed")
      .single();
    if (existingError || !existing) throw new ApiError(404, "SEED_STORY_NOT_FOUND", "没有找到这条冷启动故事。");
    const draft = normalizeDraftShape(
      validateDraft(
        {
          guide: String(existing.guide ?? ""),
          customGuide: String(existing.custom_guide ?? ""),
          title: String(input.title ?? existing.title ?? ""),
          body: String(input.body ?? existing.body ?? ""),
          mood: String(existing.mood),
          stage: String(existing.life_stage),
          age: Number(existing.age),
          gender: String(existing.gender),
          city: String(existing.city),
          cityNameEn: String(existing.city_name_en ?? ""),
          cityCountry: String(existing.city_country ?? ""),
          cityLat: existing.latitude,
          cityLon: existing.longitude,
          people: existing.people,
        } as StoryDraftInput,
        false,
        { maxBodyLength: SEED_STORY_BODY_MAX_LENGTH },
      ) as StoryDraftInput & Record<string, unknown>,
    );
    const contentHash = await storyContentHash(draft.title, draft.body);
    const { data: images } = await admin.from("generated_images").select("storage_path").eq("story_id", storyId);
    const paths = (images ?? []).map((image) => image.storage_path).filter((value): value is string => Boolean(value));
    if (paths.length) await admin.storage.from("story-images").remove(paths);
    await admin.from("generated_images").delete().eq("story_id", storyId);
    await admin
      .from("review_cases")
      .update({ status: "cancelled", resolved_at: new Date().toISOString() })
      .eq("story_id", storyId)
      .in("status", ["pending", "reviewing"]);
    await admin
      .from("ai_tasks")
      .update({ status: "cancelled", completed_at: new Date().toISOString() })
      .eq("story_id", storyId)
      .in("status", ["queued", "processing"]);
    const { data: updated, error: updateError } = await admin
      .from("stories")
      .update({
        title: draft.title,
        body: draft.body,
        excerpt: draft.body.slice(0, 70),
        content_hash: contentHash,
        status: "analyzing",
        moderation_decision: null,
        moderation_categories: [],
        ai_suggested_title: null,
        ai_type_id: null,
        ai_type_confidence: null,
        ai_type_candidates: [],
        final_type_id: null,
        ai_themes: [],
        ai_model: null,
        ai_prompt_version: null,
        ai_analyzed_at: null,
        final_themes: [],
        visual_status: "queued",
        published_at: null,
        analysis_version: Number(existing.analysis_version ?? 0) + 1,
      })
      .eq("id", storyId)
      .select("id,user_id")
      .single();
    if (updateError) throw updateError;
    await admin.from("story_embeddings").delete().eq("story_id", storyId);
    const { data: task, error: taskError } = await admin
      .from("ai_tasks")
      .insert({
        story_id: storyId,
        user_id: updated.user_id,
        task_type: "story_analysis",
        status: "queued",
      })
      .select("id")
      .single();
    if (taskError) throw taskError;
    const { error: queueError } = await admin.rpc("queue_story_analysis", { p_story_id: storyId, p_task_id: task.id });
    if (queueError) throw queueError;
    await audit(admin, user.id, action, "story", storyId, { fields: ["title", "body"] });
    return json(request, { updated: true, taskId: task.id });
  }

  if (action === "seed-generate-image") {
    const storyId = String(input.storyId ?? "");
    const style = String(input.style ?? "") as SeedImageStyle;
    if (!SEED_IMAGE_STYLES.includes(style)) {
      throw new ApiError(400, "INVALID_IMAGE_STYLE", "请选择有效的图片风格。");
    }
    const { data: story, error } = await admin
      .from("stories")
      .select("*")
      .eq("id", storyId)
      .eq("source_kind", "seed")
      .eq("status", "published")
      .eq("moderation_decision", "pass")
      .single();
    if (error || !story) throw new ApiError(404, "SEED_STORY_NOT_FOUND", "没有找到可生成图片的冷启动故事。");
    const result = await generateSeedStoryImage(admin, story, style);
    await audit(admin, user.id, action, "story", storyId, { style, reused: result.reused });
    return json(request, result);
  }

  if (action === "type-update") {
    const typeId = String(input.typeId ?? "");
    if (!isStoryTypeId(typeId)) throw new ApiError(400, "INVALID_TYPE", "没有找到这个故事类型。");
    const patch: Record<string, unknown> = {};
    if (typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color)) patch.color = input.color;
    if (typeof input.enabled === "boolean") {
      if (!input.enabled) {
        const { count } = await admin
          .from("story_types")
          .select("id", { count: "exact", head: true })
          .eq("enabled", true);
        if ((count ?? 0) <= 1) throw new ApiError(400, "LAST_TYPE_REQUIRED", "至少需要保留一个启用的故事类型。");
      }
      patch.enabled = input.enabled;
    }
    if (!Object.keys(patch).length) throw new ApiError(400, "INVALID_TYPE_UPDATE", "没有可保存的类型变化。");
    const { error } = await admin.from("story_types").update(patch).eq("id", typeId);
    if (error) throw error;
    await audit(admin, user.id, action, "story_type", typeId, patch);
    return json(request, { updated: true });
  }

  if (action === "types-reorder") {
    const orderedIds = Array.isArray(input.orderedIds) ? input.orderedIds.map(String) : [];
    if (orderedIds.length !== 21 || new Set(orderedIds).size !== 21 || orderedIds.some((id) => !isStoryTypeId(id))) {
      throw new ApiError(400, "INVALID_TYPE_ORDER", "类型顺序必须完整包含 21 个类型。");
    }
    for (let index = 0; index < orderedIds.length; index += 1) {
      const { error } = await admin
        .from("story_types")
        .update({ sort_order: 1000 + index })
        .eq("id", orderedIds[index]);
      if (error) throw error;
    }
    for (let index = 0; index < orderedIds.length; index += 1) {
      const { error } = await admin
        .from("story_types")
        .update({ sort_order: index + 1 })
        .eq("id", orderedIds[index]);
      if (error) throw error;
    }
    await audit(admin, user.id, action, "story_types", "all", { orderedIds });
    return json(request, { updated: true });
  }

  if (action === "config-save-draft") {
    const weights = recommendationWeights(input.weights);
    const { data: latest } = await admin
      .from("algorithm_configs")
      .select("version")
      .order("version", { ascending: false })
      .limit(1)
      .single();
    const { data: config, error } = await admin
      .from("algorithm_configs")
      .insert({
        version: Number(latest?.version ?? 0) + 1,
        status: "draft",
        weights,
        created_by: user.id,
      })
      .select("*")
      .single();
    if (error) throw error;
    await audit(admin, user.id, action, "algorithm_config", config.id, weights);
    return json(request, { config });
  }

  if (action === "config-publish") {
    const configId = String(input.configId ?? "");
    const { data: draft, error: draftError } = await admin
      .from("algorithm_configs")
      .select("*")
      .eq("id", configId)
      .eq("status", "draft")
      .single();
    if (draftError || !draft) throw new ApiError(404, "CONFIG_DRAFT_NOT_FOUND", "请先保存一个推荐配置草稿。");
    const { data: config, error } = await admin
      .from("algorithm_configs")
      .update({ status: "published", published_at: new Date().toISOString() })
      .eq("id", draft.id)
      .select("*")
      .single();
    if (error) throw error;
    await audit(admin, user.id, action, "algorithm_config", config.id, config.weights);
    return json(request, { config });
  }

  if (action === "task-retry") {
    const taskId = String(input.taskId ?? "");
    const { data: previous, error } = await admin.from("ai_tasks").select("*").eq("id", taskId).single();
    if (error || !previous?.story_id) throw new ApiError(404, "TASK_NOT_FOUND", "没有找到这个任务。");
    if (previous.status !== "failed") {
      throw new ApiError(409, "TASK_NOT_FAILED", "只有失败的 AI 任务可以重试。");
    }
    const { data: task, error: createError } = await admin
      .from("ai_tasks")
      .insert({
        story_id: previous.story_id,
        user_id: previous.user_id,
        task_type: previous.task_type,
        status: "queued",
      })
      .select("id")
      .single();
    if (createError) throw createError;
    const { data: messageId, error: queueError } = await admin.rpc("queue_story_analysis", {
      p_story_id: previous.story_id,
      p_task_id: task.id,
    });
    if (queueError) throw queueError;
    await processStoryAnalysis(admin, previous.story_id, task.id);
    await archiveQueueMessage(admin, typeof messageId === "number" ? messageId : Number(messageId));
    await audit(admin, user.id, action, "ai_task", taskId, { retryTaskId: task.id });
    return json(request, { taskId: task.id });
  }

  if (action === "seed-import") {
    const filename = String(input.filename ?? "stories.csv").slice(0, 200);
    const rows = Array.isArray(input.rows) ? input.rows.map((row) => row as Record<string, unknown>) : [];
    if (!rows.length || rows.length > 500)
      throw new ApiError(400, "INVALID_IMPORT", "每次请选择包含 1–500 条故事的 CSV。");
    const systemUserId = await seedProfile(admin);
    const { data: batch, error: batchError } = await admin
      .from("import_batches")
      .insert({ created_by: user.id, filename, status: "processing", total_rows: rows.length })
      .select("id")
      .single();
    if (batchError) throw batchError;
    let imported = 0;
    let failed = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const externalId = String(row.external_id ?? "").trim();
      let insertedStoryId = "";
      try {
        if (!externalId) throw new Error("external_id 不能为空");
        const { data: duplicate } = await admin
          .from("stories")
          .select("id")
          .eq("external_id", externalId)
          .eq("source_kind", "seed")
          .maybeSingle();
        if (duplicate) continue;
        const skipModeration = ["true", "1", "yes"].includes(
          String(row.skip_moderation ?? "")
            .trim()
            .toLowerCase(),
        );
        const sourceNote = String(row.source_note ?? "").trim();
        if (skipModeration && !sourceNote) throw new Error("跳过安全审核时必须填写 source_note");
        let latitude = String(row.latitude ?? "").trim() ? Number(row.latitude) : Number.NaN;
        let longitude = String(row.longitude ?? "").trim() ? Number(row.longitude) : Number.NaN;
        let cityNameEn = "";
        let cityCountry = "";
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          const location = await geocodeCity(String(row.city ?? ""));
          latitude = location.latitude;
          longitude = location.longitude;
          cityNameEn = location.cityNameEn;
          cityCountry = location.cityCountry;
        }
        const draft = normalizeDraftShape(
          validateDraft(
            {
              guide: "",
              customGuide: "",
              title: String(row.title ?? ""),
              body: String(row.body ?? ""),
              age: String(row.age ?? ""),
              gender: String(row.gender ?? ""),
              stage: String(row.stage ?? ""),
              city: String(row.city ?? ""),
              cityLat: latitude,
              cityLon: longitude,
              cityNameEn,
              cityCountry,
              mood: String(row.mood ?? ""),
              people: String(row.people ?? "")
                .split(/[|;；、]/)
                .map((value) => value.trim())
                .filter(Boolean),
            } as StoryDraftInput,
            false,
            { maxBodyLength: SEED_STORY_BODY_MAX_LENGTH },
          ) as StoryDraftInput & Record<string, unknown>,
        );
        const contentHash = await storyContentHash(draft.title, draft.body);
        const { data: story, error: storyError } = await admin
          .from("stories")
          .insert({
            user_id: systemUserId,
            author_display_name: "StoryVerse",
            title: draft.title,
            body: draft.body,
            excerpt: draft.body.slice(0, 70),
            mood: draft.mood,
            life_stage: draft.stage,
            age: draft.age,
            gender: draft.gender,
            city: draft.city,
            city_name_en: draft.cityNameEn,
            city_country: draft.cityCountry,
            latitude: draft.cityLat,
            longitude: draft.cityLon,
            people: draft.people,
            status: "analyzing",
            source_kind: "seed",
            import_batch_id: batch.id,
            external_id: externalId,
            source_note: sourceNote,
            moderation_skipped: skipModeration,
            content_hash: contentHash,
          })
          .select("id")
          .single();
        if (storyError) throw storyError;
        insertedStoryId = story.id;
        const { data: task, error: taskError } = await admin
          .from("ai_tasks")
          .insert({
            story_id: story.id,
            user_id: systemUserId,
            task_type: "story_analysis",
            status: "queued",
          })
          .select("id")
          .single();
        if (taskError) throw taskError;
        const { error: queueError } = await admin.rpc("queue_story_analysis", {
          p_story_id: story.id,
          p_task_id: task.id,
        });
        if (queueError) throw queueError;
        imported += 1;
      } catch (cause) {
        failed += 1;
        if (insertedStoryId) await admin.from("stories").delete().eq("id", insertedStoryId);
        await admin.from("import_failures").insert({
          batch_id: batch.id,
          row_number: index + 2,
          external_id: externalId || null,
          raw_data: row,
          error: cause instanceof Error ? cause.message.slice(0, 1000) : String(cause).slice(0, 1000),
        });
      }
    }
    await admin
      .from("import_batches")
      .update({
        status: failed === rows.length ? "failed" : "completed",
        imported_rows: imported,
        failed_rows: failed,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);
    const retriedFailureId = String(input.failureId ?? "");
    if (retriedFailureId && failed === 0) await admin.from("import_failures").delete().eq("id", retriedFailureId);
    await audit(admin, user.id, action, "import_batch", batch.id, { filename, imported, failed });
    return json(request, { batchId: batch.id, imported, failed });
  }

  throw new ApiError(400, "UNKNOWN_ACTION", "未知的管理员操作。");
});
