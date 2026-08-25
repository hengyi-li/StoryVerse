import { ApiError, isAllowedOrigin, json, readJson, serve } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";
import { analyticsConditionId } from "../_shared/resonance-experiment.ts";

type AnalyticsPriority = "P0" | "P1" | "P2";

const eventPriorities: Record<string, AnalyticsPriority> = {
  story_write_viewed: "P0",
  story_paste_detected: "P0",
  story_input_snapshot: "P0",
  star_lobby_viewed: "P0",
  star_exposed: "P0",
  star_clicked: "P0",
  lobby_nav_clicked: "P0",
  lobby_search_executed: "P0",
  lobby_search_cleared: "P0",
  story_read_started: "P0",
  story_read_ended: "P0",
  story_reaction_clicked: "P0",
  story_reaction_result: "P0",
  lobby_resonance_option_clicked: "P0",
  lobby_resonance_confirm_clicked: "P0",
  lobby_resonance_refresh_result: "P0",
  home_viewed: "P1",
  icebreaker_viewed: "P1",
  ai_organize_clicked: "P1",
  resonance_page_viewed: "P1",
  ai_label_edited: "P1",
  publish_clicked: "P1",
  resonance_dimension_clicked: "P1",
  resonance_confirm_clicked: "P2",
  tour_started: "P1",
  tour_step_viewed: "P1",
  tour_next_clicked: "P1",
  tour_back_clicked: "P1",
  tour_skipped: "P1",
  tour_completed: "P1",
  home_cta_clicked: "P2",
  home_preview_opened: "P2",
  auth_mode_changed: "P2",
  auth_attempted: "P2",
  auth_result: "P2",
  password_recovery_started: "P2",
  password_recovery_result: "P2",
  language_changed: "P2",
  theme_changed: "P2",
  icebreaker_card_exposed: "P2",
  icebreaker_selected: "P2",
  icebreaker_custom_input: "P2",
  icebreaker_continue_clicked: "P2",
  story_field_focused: "P2",
  story_metadata_changed: "P2",
  city_search_executed: "P2",
  city_selected: "P2",
  voice_input_started: "P2",
  voice_input_ended: "P2",
  focus_mode_changed: "P2",
  story_validation_blocked: "P2",
  story_back_clicked: "P2",
  story_autosaved: "P2",
  story_analysis_started: "P2",
  story_analysis_result: "P2",
  story_analysis_retry_clicked: "P2",
  moderation_routed: "P2",
  pending_review_lobby_entered: "P2",
  story_confirmation_viewed: "P2",
  story_body_edited: "P2",
  story_label_editor_opened: "P2",
  story_custom_theme_added: "P2",
  image_style_selected: "P2",
  image_generation_started: "P2",
  image_generation_result: "P2",
  image_downloaded: "P2",
  story_submit_result: "P2",
  recommendation_page_viewed: "P2",
  recommendation_card_exposed: "P2",
  recommendation_card_clicked: "P2",
  recommendation_refresh_clicked: "P2",
  recommendation_lobby_entered: "P2",
  recommendation_score_breakdown_viewed: "P2",
  lobby_search_opened: "P2",
  lobby_gesture_summary: "P2",
  story_panel_closed: "P2",
  report_started: "P2",
  report_result: "P2",
  account_opened: "P2",
  profile_update_result: "P2",
  feedback_submitted: "P2",
  notifications_opened: "P2",
  logout_clicked: "P2",
  pretest_consent_agreed: "P2",
  pretest_step_viewed: "P2",
  pretest_validation_blocked: "P2",
  pretest_step_saved: "P2",
  pretest_submitted: "P2",
  posttest_reminder_shown: "P2",
  posttest_reminder_dismissed: "P2",
  posttest_entry_clicked: "P2",
  posttest_step_viewed: "P2",
  posttest_validation_blocked: "P2",
  posttest_step_saved: "P2",
  posttest_submitted: "P2",
  posttest_completed_button_clicked: "P2",
};

const anonymousEventNames = new Set([
  "home_viewed",
  "home_cta_clicked",
  "home_preview_opened",
  "auth_mode_changed",
  "auth_attempted",
  "auth_result",
  "password_recovery_started",
  "password_recovery_result",
  "language_changed",
  "theme_changed",
]);

const forbiddenKey =
  /(^|_)(password|password_confirmation|security_answer|access_token|refresh_token|authorization|cookie|api_key|secret|audio|recording)($|_)/i;
const encoder = new TextEncoder();

function assertNoForbiddenKeys(value: unknown, path = "properties") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoForbiddenKeys(item, `${path}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (forbiddenKey.test(key))
      throw new ApiError(400, "FORBIDDEN_ANALYTICS_FIELD", `埋点字段 ${path}.${key} 不允许采集。`);
    assertNoForbiddenKeys(item, `${path}.${key}`);
  }
}

function stringValue(value: unknown, max: number, fallback = "") {
  const text = String(value ?? fallback);
  if (text.length > max) throw new ApiError(400, "ANALYTICS_FIELD_TOO_LONG", "埋点公共字段超过长度限制。");
  return text;
}

function uuidValue(value: unknown, required = true) {
  const text = String(value ?? "");
  if (!text && !required) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new ApiError(400, "INVALID_ANALYTICS_ID", "埋点 ID 格式不正确。");
  }
  return text;
}

async function hmac(value: string) {
  const secret = Deno.env.get("ANALYTICS_HMAC_SECRET") ?? Deno.env.get("STORYVERSE_WORKER_TOKEN");
  if (!secret) throw new Error("ANALYTICS_HMAC_SECRET is not configured");
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

serve(async (request) => {
  if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支持这个请求方式。");
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) throw new ApiError(403, "ORIGIN_NOT_ALLOWED", "请求来源不在允许列表中。");
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > 256 * 1024) throw new ApiError(413, "ANALYTICS_BATCH_TOO_LARGE", "埋点批次过大。");

  const input = await readJson<{ events?: unknown[] }>(request);
  const events = Array.isArray(input.events) ? input.events : [];
  if (!events.length || events.length > 20)
    throw new ApiError(400, "INVALID_ANALYTICS_BATCH", "每批需要包含 1–20 个事件。");
  if (encoder.encode(JSON.stringify(input)).byteLength > 256 * 1024) {
    throw new ApiError(413, "ANALYTICS_BATCH_TOO_LARGE", "埋点批次过大。");
  }

  const admin = adminClient();
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  let userId: string | null = null;
  let authenticatedConditionId: string | null = null;
  if (accessToken) {
    const { data } = await admin.auth.getUser(accessToken);
    userId = data.user?.id ?? null;
  }
  if (userId) {
    const { data: profile, error } = await admin
      .from("profiles")
      .select("username,role,status,pretest_required")
      .eq("id", userId)
      .maybeSingle();
    if (error || !profile || profile.status !== "active")
      throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "账号当前不可用。");
    if (profile.role === "admin") return json(request, { accepted: 0, skipped: events.length });
    authenticatedConditionId = analyticsConditionId(profile.username);
    if (profile.pretest_required) {
      const { data: pretest, error: pretestError } = await admin
        .from("pretest_responses")
        .select("status,consented")
        .eq("user_id", userId)
        .maybeSingle();
      if (pretestError) throw pretestError;
      if (!pretest?.consented || pretest.status === "declined") {
        throw new ApiError(403, "PRETEST_CONSENT_REQUIRED", "同意参与研究后才会记录登录态行为数据。");
      }
    }
  }
  if (!userId && !origin) throw new ApiError(403, "ORIGIN_REQUIRED", "匿名埋点请求需要有效来源。");

  const first = (events[0] ?? {}) as Record<string, unknown>;
  const anonymousId = uuidValue(first.anonymous_id) as string;
  if (!userId) {
    const requestAddress =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "local";
    const rateKey = await hmac(`${requestAddress}:${anonymousId}`);
    const { data: allowed, error } = await admin.rpc("check_analytics_rate_limit", {
      p_key_hash: rateKey,
      p_limit: 120,
      p_window_seconds: 60,
    });
    if (error) throw error;
    if (!allowed) throw new ApiError(429, "ANALYTICS_RATE_LIMITED", "埋点请求过于频繁。");
  }

  const participantKey = await hmac(`${userId ? "user" : "anonymous"}:${userId ?? anonymousId}`);
  const rows = events.map((raw) => {
    if (!raw || typeof raw !== "object") throw new ApiError(400, "INVALID_ANALYTICS_EVENT", "埋点事件格式不正确。");
    if (encoder.encode(JSON.stringify(raw)).byteLength > 64 * 1024) {
      throw new ApiError(413, "ANALYTICS_EVENT_TOO_LARGE", "单个埋点事件超过 64KB。");
    }
    const event = raw as Record<string, unknown>;
    if (uuidValue(event.anonymous_id) !== anonymousId) {
      throw new ApiError(400, "MIXED_ANALYTICS_IDENTITY", "同一批次不能包含不同的匿名身份。");
    }
    const eventName = stringValue(event.event_name, 80);
    const priority = eventPriorities[eventName];
    if (!priority) throw new ApiError(400, "UNKNOWN_ANALYTICS_EVENT", `未知埋点事件：${eventName}`);
    if (!userId && !anonymousEventNames.has(eventName)) {
      throw new ApiError(401, "ANALYTICS_AUTH_REQUIRED", "这个事件需要登录后记录。");
    }
    const properties =
      event.properties && typeof event.properties === "object" && !Array.isArray(event.properties)
        ? event.properties
        : {};
    assertNoForbiddenKeys(properties);
    const occurredAt = new Date(String(event.occurred_at ?? ""));
    if (
      !Number.isFinite(occurredAt.getTime()) ||
      Math.abs(Date.now() - occurredAt.getTime()) > 7 * 24 * 60 * 60 * 1000
    ) {
      throw new ApiError(400, "INVALID_ANALYTICS_TIME", "埋点时间超出允许范围。");
    }
    const language = event.language === "en" ? "en" : event.language === "zh" ? "zh" : null;
    const theme = event.theme === "night" ? "night" : event.theme === "day" ? "day" : null;
    const device = ["desktop", "tablet", "mobile"].includes(String(event.device_type))
      ? String(event.device_type)
      : null;
    if (!language || !theme || !device) throw new ApiError(400, "INVALID_ANALYTICS_CONTEXT", "埋点页面上下文不完整。");
    return {
      event_id: uuidValue(event.event_id),
      event_name: eventName,
      event_version: 1,
      priority,
      occurred_at: occurredAt.toISOString(),
      user_id: userId,
      participant_key: participantKey,
      anonymous_id: uuidValue(event.anonymous_id),
      session_id: uuidValue(event.session_id),
      page_view_id: uuidValue(event.page_view_id),
      lobby_view_id: uuidValue(event.lobby_view_id, false),
      recommendation_batch_id: uuidValue(event.recommendation_batch_id, false),
      page_id: stringValue(event.page_id, 80),
      route: stringValue(event.route, 300),
      component: stringValue(event.component, 120) || null,
      language,
      theme,
      device_type: device,
      viewport:
        event.viewport && typeof event.viewport === "object" && !Array.isArray(event.viewport) ? event.viewport : {},
      browser: stringValue(event.browser, 80, "unknown"),
      os: stringValue(event.os, 80, "unknown"),
      study_id: stringValue(event.study_id, 80, "storyverse_lab_v1"),
      condition_id: authenticatedConditionId ?? stringValue(event.condition_id, 80, "default"),
      app_version: stringValue(event.app_version, 120, "development"),
      environment: ["local", "preview", "production", "test"].includes(String(event.environment))
        ? String(event.environment)
        : "production",
      properties,
    };
  });

  const { error } = await admin
    .from("analytics_events")
    .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true });
  if (error) throw error;
  return json(request, { accepted: rows.length, skipped: 0 });
});
