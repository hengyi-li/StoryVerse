export type ResonanceExperimentCondition = "all_similar" | "all_different";

export function resonanceExperimentCondition(username: unknown): ResonanceExperimentCondition | null {
  const account = String(username ?? "").trim();
  if (/^aisa\d+$/i.test(account)) return "all_similar";
  if (/^aisb\d+$/i.test(account)) return "all_different";
  return null;
}

export function analyticsConditionId(username: unknown) {
  const condition = resonanceExperimentCondition(username);
  if (condition === "all_similar") return "resonance_all_similar";
  if (condition === "all_different") return "resonance_all_different";
  return null;
}
