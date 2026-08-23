import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routePatchFromPath } from "../src/app/routes";
import { analyticsEventPriorities } from "../src/lib/analytics-events";
import { birthYearOptions, validatePretestStep } from "../src/features/pretest/PreTestPage";
import { emptyPretestAnswers } from "../src/features/pretest/pretest-content";
import {
  chinaRegions,
  disciplineOptions,
  ethnicityOptions,
  industryOptions,
} from "../src/features/pretest/pretest-options.generated";

describe("PreTest routing and assets", () => {
  it("maps the protected route and includes it in CloudBase fallbacks", () => {
    expect(routePatchFromPath("/PreTest").screen).toBe("pretest");
    expect(readFileSync("scripts/create-spa-route-fallbacks.mjs", "utf8")).toContain('"PreTest"');
  });

  it("keeps original previews and responsive WebP assets", () => {
    for (const file of [
      "src/assets/storyverse1.png",
      "src/assets/storyverse2.png",
      "src/assets/storyverse1-960.webp",
      "src/assets/storyverse1-1600.webp",
      "src/assets/storyverse2-960.webp",
      "src/assets/storyverse2-1600.webp",
    ]) {
      expect(existsSync(file)).toBe(true);
    }
  });
});

describe("PreTest conditional form", () => {
  it("offers every birth year in descending order from 2026 to 1900", () => {
    expect(birthYearOptions).toHaveLength(127);
    expect(birthYearOptions[0].value).toBe("2026");
    expect(birthYearOptions.at(-1)?.value).toBe("1900");
    expect(birthYearOptions.every((option) => option.labelZh === option.value && option.labelEn === option.value)).toBe(
      true,
    );
  });

  it("accepts both birth-year boundaries and rejects values outside them", () => {
    const base = {
      ...emptyPretestAnswers,
      consented: true,
      gender: "female",
      residenceRegion: "hong_kong",
      province: "hong_kong",
      city: "hong_kong",
    };
    expect(validatePretestStep(2, { ...base, birthYear: 1900 })).toEqual({});
    expect(validatePretestStep(2, { ...base, birthYear: 2026 })).toEqual({});
    expect(validatePretestStep(2, { ...base, birthYear: 1899 })).toHaveProperty("birthYear");
    expect(validatePretestStep(2, { ...base, birthYear: 2027 })).toHaveProperty("birthYear");
  });

  it("requires China residence details and overseas country text", () => {
    const base = { ...emptyPretestAnswers, consented: true, birthYear: 2000, gender: "other" };
    expect(validatePretestStep(2, { ...base, residenceRegion: "china_mainland" })).toMatchObject({
      province: expect.any(String),
      city: expect.any(String),
      communityType: expect.any(String),
    });
    expect(validatePretestStep(2, { ...base, residenceRegion: "overseas" })).toHaveProperty("countryRegion");
  });

  it("requires industry and major only for the approved branches", () => {
    const employed = { ...emptyPretestAnswers, education: "bachelor", employment: "full_time" };
    expect(validatePretestStep(4, employed)).toMatchObject({
      industryPrimary: expect.any(String),
      industrySecondary: expect.any(String),
    });
    expect(validatePretestStep(4, { ...employed, employment: "unemployed" })).not.toHaveProperty("industryPrimary");
    expect(
      validatePretestStep(4, { ...emptyPretestAnswers, education: "associate", employment: "student_unpaid" }),
    ).toMatchObject({ discipline: expect.any(String), major: expect.any(String) });
    expect(
      validatePretestStep(4, {
        ...emptyPretestAnswers,
        education: "senior_high_vocational",
        employment: "student_unpaid",
      }),
    ).not.toHaveProperty("major");
    for (const employment of ["full_time", "internship_part_time", "freelancer"]) {
      expect(validatePretestStep(4, { ...employed, employment })).toMatchObject({
        industryPrimary: expect.any(String),
        industrySecondary: expect.any(String),
      });
    }
  });

  it("requires an explanation only when education is Other", () => {
    const base = { ...emptyPretestAnswers, ethnicity: "han_zu" };
    expect(validatePretestStep(3, { ...base, education: "other" })).toHaveProperty("educationOther");
    expect(validatePretestStep(3, { ...base, education: "other", educationOther: "职业课程" })).toEqual({});
    expect(validatePretestStep(3, { ...base, education: "bachelor" })).not.toHaveProperty("educationOther");
  });
});

describe("PreTest option and persistence contract", () => {
  it("provides bilingual labels for every generated option", () => {
    const options = [
      ...ethnicityOptions,
      ...chinaRegions.flatMap((group) => [group, ...group.children]),
      ...industryOptions.flatMap((group) => [group, ...group.children]),
      ...disciplineOptions.flatMap((group) => [group, ...group.children]),
    ];
    expect(chinaRegions).toHaveLength(34);
    expect(options.length).toBeGreaterThan(300);
    expect(options.every((option) => option.value && option.labelZh && option.labelEn)).toBe(true);
  });

  it("grandfathers existing profiles before applying the new-account default", () => {
    const migration = readFileSync("supabase/migrations/202608220002_pretest.sql", "utf8");
    expect(migration.indexOf("update public.profiles set pretest_required = false")).toBeLessThan(
      migration.indexOf("alter column pretest_required set default true"),
    );
    expect(migration).toContain("grant select on public.pretest_responses to authenticated");
    expect(migration).not.toMatch(/grant (insert|update|delete).*pretest_responses to authenticated/i);
  });

  it("registers only P2 pre-study events", () => {
    for (const event of [
      "pretest_consent_agreed",
      "pretest_step_viewed",
      "pretest_validation_blocked",
      "pretest_step_saved",
      "pretest_submitted",
    ] as const) {
      expect(analyticsEventPriorities[event]).toBe("P2");
    }
  });
});
