import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyticsDeviceType } from "../src/lib/analytics";
import { analyticsEventNames, analyticsEventPriorities } from "../src/lib/analytics-events";
import { createActiveTimer } from "../src/lib/analytics-timing";
import {
  hasReachedStarExposureThreshold,
  isMeaningfulStoryRead,
  normalizeLobbySearchQuery,
  starExposureKey,
} from "../src/features/star-lobby/analytics-rules";

describe("analytics event contract", () => {
  it("uses only the P0, P1 and P2 priority vocabulary", () => {
    expect(new Set(Object.values(analyticsEventPriorities))).toEqual(new Set(["P0", "P1", "P2"]));
    expect(analyticsEventPriorities.star_exposed).toBe("P0");
    expect(analyticsEventPriorities.ai_organize_clicked).toBe("P1");
    expect(analyticsEventPriorities.lobby_gesture_summary).toBe("P2");
    expect(analyticsEventPriorities.recommendation_score_breakdown_viewed).toBe("P2");
  });

  it("keeps the Edge Function whitelist in sync with the client event dictionary", () => {
    const source = readFileSync("supabase/functions/analytics-track/index.ts", "utf8");
    for (const eventName of analyticsEventNames) expect(source).toContain(`${eventName}:`);
  });

  it("derives authenticated resonance conditions from the server-side account prefix", () => {
    const source = readFileSync("supabase/functions/analytics-track/index.ts", "utf8");
    const classifier = readFileSync("supabase/functions/_shared/resonance-experiment.ts", "utf8");
    expect(source).toContain("authenticatedConditionId ??");
    expect(source).toContain("analyticsConditionId(profile.username)");
    expect(classifier).toContain('return "resonance_all_similar"');
    expect(classifier).toContain('return "resonance_all_different"');
  });

  it("does not permit legacy priority labels in the analytics implementation", () => {
    const sources = [
      readFileSync("src/lib/analytics-events.ts", "utf8"),
      readFileSync("supabase/functions/analytics-track/index.ts", "utf8"),
      readFileSync("supabase/migrations/202608200001_analytics.sql", "utf8"),
    ].join("\n");
    expect(sources).not.toContain("P000");
  });

  it("classifies viewport widths deterministically", () => {
    expect(analyticsDeviceType(390)).toBe("mobile");
    expect(analyticsDeviceType(768)).toBe("tablet");
    expect(analyticsDeviceType(1099)).toBe("tablet");
    expect(analyticsDeviceType(1100)).toBe("desktop");
  });
});

describe("active analytics timer", () => {
  it("accumulates only resumed periods", () => {
    let now = 100;
    const timer = createActiveTimer(() => now);
    timer.resume();
    now = 350;
    timer.pause();
    now = 900;
    expect(timer.read()).toBe(250);
    timer.resume();
    now = 1_050;
    expect(timer.read()).toBe(400);
  });

  it("does not double count duplicate resume and pause calls", () => {
    let now = 0;
    const timer = createActiveTimer(() => now);
    timer.resume();
    timer.resume();
    now = 20_000;
    timer.pause();
    timer.pause();
    expect(timer.read()).toBe(20_000);
  });
});

describe("StarLobby analytics boundaries", () => {
  it("requires one continuous visible second for a star exposure", () => {
    expect(hasReachedStarExposureThreshold(100, 1_099)).toBe(false);
    expect(hasReachedStarExposureThreshold(100, 1_100)).toBe(true);
  });

  it("allows the same story to be exposed in a new lobby batch but not under the same key", () => {
    expect(starExposureKey("lobby-a", "explore", "story-1")).toBe(starExposureKey("lobby-a", "explore", "story-1"));
    expect(starExposureKey("lobby-a", "explore", "story-1")).not.toBe(starExposureKey("lobby-b", "explore", "story-1"));
  });

  it("uses the exact 20 second meaningful-read boundary and excludes own stories", () => {
    expect(isMeaningfulStoryRead(19_999, false)).toBe(false);
    expect(isMeaningfulStoryRead(20_000, false)).toBe(true);
    expect(isMeaningfulStoryRead(20_000, true)).toBe(false);
  });

  it("normalizes lobby searches for consecutive-query deduplication", () => {
    expect(normalizeLobbySearchQuery("  BeiJing  ")).toBe("beijing");
  });
});

describe("analytics persistence contract", () => {
  const migration = readFileSync("supabase/migrations/202608200001_analytics.sql", "utf8");

  it("retains events after user deletion and blocks direct client writes", () => {
    expect(migration).toMatch(/user_id uuid references public\.profiles\(id\) on delete set null/i);
    expect(migration).not.toMatch(/grant insert on public\.analytics_events to (anon|authenticated)/i);
    expect(migration).toContain("analytics_events_admin_read");
  });

  it("enforces event idempotency and priority values", () => {
    expect(migration).toContain("event_id uuid primary key");
    expect(migration).toContain("('P0', 'P1', 'P2')");
  });
});
