import type { RecommendationScores, ResonancePreferences } from "../../types/domain";

export type RecommendationScoreKind = "match" | "reference" | "owned" | "curated";

export type RecommendationScorePresentation = {
  kind: RecommendationScoreKind;
  overall: number | null;
  city: number | null;
  life: number | null;
  theme: number | null;
  semantic: number | null;
};

function unitScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

export function scorePercentage(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function recommendationScorePresentation(input: {
  scores?: RecommendationScores;
  rawCityScore: number;
  resonance: ResonancePreferences;
  ownedByCurrentUser: boolean;
  isCenterStory: boolean;
}): RecommendationScorePresentation {
  if (input.isCenterStory) {
    return { kind: "reference", overall: null, city: null, life: null, theme: null, semantic: null };
  }
  if (input.ownedByCurrentUser) {
    return { kind: "owned", overall: null, city: null, life: null, theme: null, semantic: null };
  }

  const overall = unitScore(input.scores?.final_score);
  if (overall === null) {
    return { kind: "curated", overall: null, city: null, life: null, theme: null, semantic: null };
  }

  const rawCity = unitScore(input.rawCityScore);
  return {
    kind: "match",
    overall,
    city: rawCity === null ? null : input.resonance.city === "different" ? 1 - rawCity : rawCity,
    life: unitScore(input.scores?.life_score),
    theme: unitScore(input.scores?.theme_score),
    semantic: unitScore(input.scores?.semantic_score),
  };
}
