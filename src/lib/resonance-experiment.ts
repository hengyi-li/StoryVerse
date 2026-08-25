import type { ResonancePreferences } from "../types/domain";

export type ResonanceExperimentCondition = "all_similar" | "all_different";

const allSimilarPattern = /^aisa\d+$/i;
const allDifferentPattern = /^aisb\d+$/i;

export function resonanceExperimentCondition(accountIdentifier: string): ResonanceExperimentCondition | null {
  const account = accountIdentifier.trim();
  if (allSimilarPattern.test(account)) return "all_similar";
  if (allDifferentPattern.test(account)) return "all_different";
  return null;
}

export function fixedResonancePreferences(condition: ResonanceExperimentCondition): ResonancePreferences {
  const mode = condition === "all_similar" ? "similar" : "different";
  return { city: mode, stage: mode, theme: mode };
}

export function isResonanceExperimentAccount(accountIdentifier: string) {
  return resonanceExperimentCondition(accountIdentifier) !== null;
}
