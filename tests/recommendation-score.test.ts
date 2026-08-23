import { describe, expect, it } from "vitest";
import { recommendationScorePresentation, scorePercentage } from "../src/features/star-lobby/recommendation-score";
import type { RecommendationScores, ResonancePreferences } from "../src/types/domain";

const scores: RecommendationScores = {
  rank: 1,
  city_score: 0.12,
  life_score: 0.68,
  theme_score: 0.84,
  semantic_score: 0.89,
  final_score: 0.82,
};

const similar: ResonancePreferences = { city: "similar", stage: "similar", theme: "similar" };

describe("StarLobby 综合共鸣匹配度", () => {
  it("综合百分比严格使用 final_score，而不是城市分数", () => {
    const result = recommendationScorePresentation({
      scores,
      rawCityScore: 0.31,
      resonance: similar,
      ownedByCurrentUser: false,
      isCenterStory: false,
    });

    expect(result.kind).toBe("match");
    expect(scorePercentage(result.overall)).toBe(82);
    expect(scorePercentage(result.city)).toBe(31);
  });

  it("城市分项按相近或相异偏好翻转真实地理接近度", () => {
    const common = {
      scores,
      rawCityScore: 0.31,
      ownedByCurrentUser: false,
      isCenterStory: false,
    };
    expect(recommendationScorePresentation({ ...common, resonance: similar }).city).toBeCloseTo(0.31);
    expect(
      recommendationScorePresentation({
        ...common,
        resonance: { ...similar, city: "different" },
      }).city,
    ).toBeCloseTo(0.69);
  });

  it("人生背景和主题沿用服务端方向分，故事语义始终保持正向", () => {
    const result = recommendationScorePresentation({
      scores,
      rawCityScore: 0.31,
      resonance: { city: "similar", stage: "different", theme: "different" },
      ownedByCurrentUser: false,
      isCenterStory: false,
    });
    expect(result.life).toBe(0.68);
    expect(result.theme).toBe(0.84);
    expect(result.semantic).toBe(0.89);
  });

  it("本人故事和无推荐分故事不伪造百分比", () => {
    expect(
      recommendationScorePresentation({
        scores,
        rawCityScore: 1,
        resonance: similar,
        ownedByCurrentUser: true,
        isCenterStory: true,
      }).kind,
    ).toBe("reference");
    expect(
      recommendationScorePresentation({
        scores,
        rawCityScore: 0.8,
        resonance: similar,
        ownedByCurrentUser: true,
        isCenterStory: false,
      }).kind,
    ).toBe("owned");
    expect(
      recommendationScorePresentation({
        rawCityScore: 0.5,
        resonance: similar,
        ownedByCurrentUser: false,
        isCenterStory: false,
      }),
    ).toMatchObject({ kind: "curated", overall: null });
  });

  it("异常分数会被限制在 0 到 100%，缺失值保持为空", () => {
    expect(scorePercentage(1.4)).toBe(100);
    expect(scorePercentage(null)).toBeNull();
    const result = recommendationScorePresentation({
      scores: { ...scores, final_score: 1.4, semantic_score: -0.2 },
      rawCityScore: 4,
      resonance: similar,
      ownedByCurrentUser: false,
      isCenterStory: false,
    });
    expect(scorePercentage(result.overall)).toBe(100);
    expect(scorePercentage(result.city)).toBe(100);
    expect(scorePercentage(result.semantic)).toBe(0);
  });
});
