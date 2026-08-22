import { supabase } from "./supabase";
import { analyticsEventPriorities } from "./analytics-events";
import type { AnalyticsEventName } from "./analytics-events";
import type { Language } from "../types/domain";
import type { ThemeMode } from "../types/ui";

type AnalyticsProperties = Record<string, unknown>;
type DeviceType = "desktop" | "tablet" | "mobile";

type AnalyticsContext = {
  pageId: string;
  pageViewId: string;
  language: Language;
  theme: ThemeMode;
  role: "user" | "admin" | null;
  lobbyViewId: string | null;
  recommendationBatchId: string | null;
};

type AnalyticsCollectionMode = "anonymous_only" | "authenticated" | "disabled";
type QueuedEvent = Record<string, unknown> & {
  event_id: string;
  event_name: AnalyticsEventName;
  attempts: number;
  transport_authenticated: boolean;
};

const analyticsStorageKey = "storyverse.analytics.anonymous.v1";
const analyticsSessionKey = "storyverse.analytics.session.v1";
const sessionIdleMs = 30 * 60 * 1000;
const flushDelayMs = 5000;
const maxAttempts = 3;
const anonymousEventNames = new Set<AnalyticsEventName>([
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

let context: AnalyticsContext = {
  pageId: "unknown",
  pageViewId: crypto.randomUUID(),
  language: "zh",
  theme: "day",
  role: null,
  lobbyViewId: null,
  recommendationBatchId: null,
};
let queue: QueuedEvent[] = [];
let flushTimer: number | null = null;
let flushing = false;
let cachedAccessToken = "";
let collectionMode: AnalyticsCollectionMode = "anonymous_only";

export function analyticsDeviceType(width: number): DeviceType {
  if (width < 768) return "mobile";
  if (width < 1100) return "tablet";
  return "desktop";
}

function browserName(userAgent: string) {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) return "Safari";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  return "Other";
}

function osName(userAgent: string) {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS";
  if (/Android/.test(userAgent)) return "Android";
  if (/Mac OS X/.test(userAgent)) return "macOS";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Linux/.test(userAgent)) return "Linux";
  return "Other";
}

function persistentUuid(storage: Storage, key: string) {
  const existing = storage.getItem(key);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const created = crypto.randomUUID();
  storage.setItem(key, created);
  return created;
}

function sessionId() {
  const now = Date.now();
  try {
    const stored = JSON.parse(sessionStorage.getItem(analyticsSessionKey) || "null") as {
      id?: string;
      lastActivity?: number;
    } | null;
    const id =
      stored?.id && stored.lastActivity && now - stored.lastActivity <= sessionIdleMs ? stored.id : crypto.randomUUID();
    sessionStorage.setItem(analyticsSessionKey, JSON.stringify({ id, lastActivity: now }));
    return id;
  } catch {
    const id = crypto.randomUUID();
    sessionStorage.setItem(analyticsSessionKey, JSON.stringify({ id, lastActivity: now }));
    return id;
  }
}

function endpoint() {
  const base = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}/functions/v1/analytics-track` : "";
}

function analyticsEnvironment() {
  if (import.meta.env.MODE === "test") return "test";
  if (location.hostname === "127.0.0.1" || location.hostname === "localhost") return "local";
  if (import.meta.env.DEV) return "preview";
  return "production";
}

function commonEvent(eventName: AnalyticsEventName, properties: AnalyticsProperties): QueuedEvent {
  const anonymousId = persistentUuid(localStorage, analyticsStorageKey);
  const userAgent = navigator.userAgent;
  return {
    event_id: crypto.randomUUID(),
    event_name: eventName,
    event_version: 1,
    priority: analyticsEventPriorities[eventName],
    occurred_at: new Date().toISOString(),
    anonymous_id: anonymousId,
    session_id: sessionId(),
    page_view_id: context.pageViewId,
    lobby_view_id: context.lobbyViewId,
    recommendation_batch_id: context.recommendationBatchId,
    page_id: context.pageId,
    route: `${location.pathname}${location.search}`,
    component: typeof properties.component === "string" ? properties.component : null,
    language: context.language,
    theme: context.theme,
    device_type: analyticsDeviceType(window.innerWidth),
    viewport: { width: window.innerWidth, height: window.innerHeight, pixel_ratio: window.devicePixelRatio },
    browser: browserName(userAgent),
    os: osName(userAgent),
    study_id: import.meta.env.VITE_ANALYTICS_STUDY_ID || "storyverse_lab_v1",
    condition_id: import.meta.env.VITE_ANALYTICS_CONDITION_ID || "default",
    app_version: __APP_VERSION__,
    environment: analyticsEnvironment(),
    properties,
    attempts: 0,
    transport_authenticated: collectionMode === "authenticated",
  };
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushAnalytics();
  }, flushDelayMs);
}

async function send(events: QueuedEvent[], keepalive = false) {
  const url = endpoint();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return false;
  const authenticated = events[0]?.transport_authenticated === true;
  if (authenticated && !cachedAccessToken) return false;
  const payload = JSON.stringify({
    events: events.map(({ attempts: _attempts, transport_authenticated: _transport, ...event }) => event),
  });
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "Content-Type": "application/json",
      ...(authenticated ? { Authorization: `Bearer ${cachedAccessToken}` } : {}),
    },
    body: payload,
    keepalive,
  });
  return response.ok;
}

function takeBatch(keepalive: boolean) {
  const byteLimit = keepalive ? 60 * 1024 : 250 * 1024;
  const batch: QueuedEvent[] = [];
  let payloadBytes = 13;
  const authenticated = queue[0]?.transport_authenticated;
  while (queue.length && batch.length < 20) {
    const candidate = queue[0];
    if (candidate.transport_authenticated !== authenticated) break;
    const candidateBytes = new TextEncoder().encode(JSON.stringify(candidate)).byteLength + 1;
    if (batch.length && payloadBytes + candidateBytes > byteLimit) break;
    batch.push(queue.shift()!);
    payloadBytes += candidateBytes;
  }
  return batch;
}

async function sendImmediate(event: QueuedEvent) {
  try {
    if (!(await send([event]))) throw new Error("analytics delivery failed");
  } catch {
    const retryable = { ...event, attempts: event.attempts + 1 };
    if (retryable.attempts <= maxAttempts) {
      queue.push(retryable);
      scheduleFlush();
    }
  }
}

export async function flushAnalytics(keepalive = false) {
  if (flushing || !queue.length || context.role === "admin") return;
  flushing = true;
  const batch = takeBatch(keepalive);
  try {
    const sent = await send(batch, keepalive);
    if (!sent) throw new Error("analytics delivery failed");
  } catch {
    const retryable = batch
      .map((event) => ({ ...event, attempts: event.attempts + 1 }))
      .filter((event) => event.attempts <= maxAttempts);
    queue = [...retryable, ...queue].slice(0, 200);
  } finally {
    flushing = false;
    if (queue.length && !keepalive) scheduleFlush();
  }
}

export function track(
  eventName: AnalyticsEventName,
  properties: AnalyticsProperties = {},
  options?: { immediate?: boolean },
) {
  if (context.role === "admin" || collectionMode === "disabled") return "";
  if (collectionMode === "anonymous_only" && !anonymousEventNames.has(eventName)) return "";
  if (collectionMode === "authenticated" && context.role !== "user") return "";
  const event = commonEvent(eventName, properties);
  if (options?.immediate || eventName === "story_input_snapshot") void sendImmediate(event);
  else {
    queue.push(event);
    scheduleFlush();
  }
  return event.event_id;
}

export async function trackBeforeNavigation(eventName: AnalyticsEventName, properties: AnalyticsProperties = {}) {
  if (context.role === "admin" || collectionMode === "disabled") return "";
  if (collectionMode === "anonymous_only" && !anonymousEventNames.has(eventName)) return "";
  if (collectionMode === "authenticated" && context.role !== "user") return "";
  const event = commonEvent(eventName, properties);
  for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
    try {
      if (await send([event])) return event.event_id;
    } catch {
      // Navigation must still continue after the bounded delivery attempts.
    }
  }
  return event.event_id;
}

export function setAnalyticsPage(
  pageId: string,
  values: { language: Language; theme: ThemeMode; role?: "user" | "admin" | null },
) {
  context = {
    ...context,
    pageId,
    pageViewId: crypto.randomUUID(),
    language: values.language,
    theme: values.theme,
    role: values.role ?? context.role,
    lobbyViewId: pageId === "star_lobby" ? context.lobbyViewId || crypto.randomUUID() : null,
    recommendationBatchId: pageId === "star_lobby" ? context.recommendationBatchId : null,
  };
  return context.pageViewId;
}

export function updateAnalyticsContext(values: Partial<Omit<AnalyticsContext, "pageViewId">>) {
  context = { ...context, ...values };
}

export function setAnalyticsCollectionMode(mode: AnalyticsCollectionMode) {
  collectionMode = mode;
  if (mode === "disabled") {
    queue = queue.filter((event) => !event.transport_authenticated);
    if (queue.length) scheduleFlush();
  }
}

export function analyticsCollectionMode() {
  return collectionMode;
}

export function createLobbyView(recommendationBatchId: string | null = null) {
  const lobbyViewId = crypto.randomUUID();
  context = { ...context, lobbyViewId, recommendationBatchId };
  return lobbyViewId;
}

export function analyticsContext() {
  return { ...context };
}

if (typeof window !== "undefined") {
  void supabase.auth.getSession().then(({ data }) => {
    cachedAccessToken = data.session?.access_token ?? "";
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedAccessToken = session?.access_token ?? "";
  });
  window.addEventListener("pagehide", () => {
    if (queue.length) void flushAnalytics(true);
  });
}
