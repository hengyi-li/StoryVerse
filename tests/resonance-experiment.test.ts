import { describe, expect, it } from "vitest";
import {
  fixedResonancePreferences,
  isResonanceExperimentAccount,
  resonanceExperimentCondition,
} from "../src/lib/resonance-experiment";
import { guardResonanceScreenForExperiment, screenAfterPublishedStory } from "../src/app/routes";

describe("resonance experiment account prefixes", () => {
  it.each([
    ["AISA01", "all_similar"],
    ["aisa21", "all_similar"],
    ["AISB01", "all_different"],
    ["aisb100", "all_different"],
  ] as const)("classifies %s as %s", (account, condition) => {
    expect(resonanceExperimentCondition(account)).toBe(condition);
    expect(isResonanceExperimentAccount(account)).toBe(true);
  });

  it.each(["AISA", "AISA_TEST", "MYAISA01", "AISC01", "AISB-01", ""])(
    "does not classify the ordinary account %s",
    (account) => {
      expect(resonanceExperimentCondition(account)).toBeNull();
      expect(isResonanceExperimentAccount(account)).toBe(false);
    },
  );

  it("maps each condition to all three fixed dimensions", () => {
    expect(fixedResonancePreferences("all_similar")).toEqual({
      city: "similar",
      stage: "similar",
      theme: "similar",
    });
    expect(fixedResonancePreferences("all_different")).toEqual({
      city: "different",
      stage: "different",
      theme: "different",
    });
  });

  it("skips the resonance screen only for fixed-condition accounts", () => {
    expect(screenAfterPublishedStory("all_similar")).toBe("starLobby");
    expect(screenAfterPublishedStory("all_different")).toBe("starLobby");
    expect(screenAfterPublishedStory(null)).toBe("resonance");
    expect(guardResonanceScreenForExperiment("resonance", "all_similar")).toBe("starLobby");
    expect(guardResonanceScreenForExperiment("resonance", null)).toBe("resonance");
    expect(guardResonanceScreenForExperiment("storyEditor", "all_different")).toBe("storyEditor");
  });
});
