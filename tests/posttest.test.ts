import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { guardPostPublishScreenForFirstStory, routePatchFromPath } from "../src/app/routes";
import {
  missingPosttestItems,
  posttestItemIds,
  posttestScale,
  posttestSections,
} from "../src/features/posttest/posttest-content";
import { analyticsEventPriorities } from "../src/lib/analytics-events";

describe("PostTest questionnaire contract", () => {
  it("keeps all 41 bilingual items in the approved five sections", () => {
    expect(posttestSections.map((section) => section.items.length)).toEqual([8, 10, 7, 10, 6]);
    expect(posttestItemIds).toHaveLength(41);
    expect(new Set(posttestItemIds).size).toBe(41);
    expect(posttestSections.flatMap((section) => section.items).every((item) => item.zh && item.en)).toBe(true);
  });

  it("hides section theme names while retaining accessible progress", () => {
    const page = readFileSync("src/features/posttest/PostTestPage.tsx", "utf8");
    expect(page).not.toContain("<b>{item.titleZh}</b>");
    expect(page).not.toContain('<h2 id="posttest-step-title">{section.titleZh}</h2>');
    expect(page).toContain("posttest-visually-hidden");
    expect(page).toContain("Part {step} of 5");
  });

  it("uses the fixed 1–5 scale and requires the image items", () => {
    expect(posttestScale.map((option) => option.value)).toEqual([1, 2, 3, 4, 5]);
    expect(missingPosttestItems(5, {})).toContain("authorship_ai_05");
    expect(missingPosttestItems(5, {})).toContain("authorship_ai_06");
    expect(
      missingPosttestItems(5, {
        authorship_ai_01: 1,
        authorship_ai_02: 2,
        authorship_ai_03: 3,
        authorship_ai_04: 4,
        authorship_ai_05: 5,
        authorship_ai_06: 1,
      }),
    ).toEqual([]);
  });

  it("maps /PostTest and prevents access before the first story", () => {
    expect(routePatchFromPath("/PostTest").screen).toBe("posttest");
    expect(guardPostPublishScreenForFirstStory("posttest", false)).toBe("storyEditor");
    expect(guardPostPublishScreenForFirstStory("posttest", true)).toBe("posttest");
  });

  it("includes the direct route in CloudBase fallbacks", () => {
    expect(readFileSync("scripts/create-spa-route-fallbacks.mjs", "utf8")).toContain('"PostTest"');
    expect(readFileSync("scripts/verify-cloudbase-build.mjs", "utf8")).toContain('"PostTest"');
  });

  it("registers every post-study event as P2", () => {
    for (const event of [
      "posttest_reminder_shown",
      "posttest_reminder_dismissed",
      "posttest_entry_clicked",
      "posttest_step_viewed",
      "posttest_validation_blocked",
      "posttest_step_saved",
      "posttest_submitted",
      "posttest_completed_button_clicked",
    ] as const) {
      expect(analyticsEventPriorities[event]).toBe("P2");
    }
  });

  it("keeps server validation and read-only RLS in the migration", () => {
    const migration = readFileSync("supabase/migrations/202608230001_posttest.sql", "utf8");
    const edgeFunction = readFileSync("supabase/functions/posttest/index.ts", "utf8");
    expect(migration).toContain("private.valid_posttest_answers");
    expect(migration).toContain("posttest_responses_owner_read");
    expect(migration).toContain("grant select on public.posttest_responses to authenticated");
    expect(migration).not.toMatch(/grant (insert|update|delete).*posttest_responses to authenticated/i);
    expect(edgeFunction).toContain('pretest?.status === "completed"');
    expect(edgeFunction).toContain('input.action === "submit"');
  });
});
