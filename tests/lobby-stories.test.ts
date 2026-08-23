import { describe, expect, it } from "vitest";
import { applyStoryTranslation, mergeLobbyStories, type StoryRecommendation } from "../src/services/data-service";
import { geographicCityScore } from "../src/lib/geo-distance";
import type { Story } from "../src/types/domain";
import { storyPayload } from "../supabase/functions/_shared/story-data.ts";

function story(
  id: string,
  status: Story["status"],
  coordinates: { latitude: number; longitude: number } = { latitude: 31.2304, longitude: 121.4737 },
): Story {
  return {
    id,
    status,
    title: id,
    excerpt: "摘要",
    body: "这是一个用于测试的故事正文。".repeat(12),
    author: "测试用户",
    city: "上海",
    stage: "成年早期",
    age: 24,
    gender: "女",
    ...coordinates,
    theme: "成长",
    emotion: "平和自足",
    meaning: "理解",
    perspective: "人生经验",
    people: ["自己"],
    readMinutes: 1,
    typeId: "other_or_unclassifiable",
    themes: ["成长", "选择"],
    visualStatus: "ready",
    x: 50,
    y: 50,
  };
}

describe("StarLobby 故事合并", () => {
  it("把作者自己的公开故事合并到只包含他人故事的推荐结果中", () => {
    const recommendations: StoryRecommendation[] = [{ story: story("other", "published"), reason: "推荐" }];
    const result = mergeLobbyStories(recommendations, [story("mine", "published")]);
    expect(result.map((item) => item.story.id)).toEqual(["mine", "other"]);
    expect(result[0].story.isCenterStory).toBe(true);
    expect(result[0].story.cityScore).toBe(1);
  });

  it("作者可以看到自己的待审故事，但不会加入未完成或已下架故事", () => {
    const result = mergeLobbyStories(
      [],
      [story("pending", "pending_review"), story("analysing", "analyzing"), story("removed", "removed")],
    );
    expect(result.map((item) => item.story.id)).toEqual(["pending"]);
    expect(result[0].reason).toBe("仅自己可见");
  });

  it("推荐结果中若已有自己的故事，不会重复显示", () => {
    const mine = story("mine", "published");
    const result = mergeLobbyStories([{ story: mine, reason: "旧推荐" }], [mine]);
    expect(result).toHaveLength(1);
  });

  it("只把列表中最近发布的本人故事设为中心，并按真实经纬度重算大厅 cityScore", () => {
    const recommendation = story("other", "published", { latitude: 39.9042, longitude: 116.4074 });
    recommendation.cityScore = 0.42;
    const result = mergeLobbyStories(
      [{ story: recommendation, reason: "推荐" }],
      [story("latest", "published"), story("older", "published", { latitude: 30.5728, longitude: 104.0668 })],
    );

    expect(result[0].story.isCenterStory).toBe(true);
    expect(result[1].story.isCenterStory).toBe(false);
    expect(result[1].story.cityScore).toBeLessThan(1);
    expect(result[2].story.cityScore).toBeCloseTo(
      geographicCityScore(story("latest", "published"), recommendation),
      10,
    );
  });

  it("推荐接口保留经纬度，使大厅不会把真实城市距离统一兜底为 50%", () => {
    const center = story("mine", "published");
    const payload = storyPayload({
      id: "api-story",
      title: "北京故事",
      body: "这是一个用于验证推荐接口经纬度载荷的故事。",
      city: "北京",
      latitude: "39.9042",
      longitude: "116.4074",
      status: "published",
      final_themes: ["城市记忆", "人生选择"],
    });

    expect(payload).toMatchObject({ latitude: 39.9042, longitude: 116.4074 });
    const result = mergeLobbyStories([{ story: payload as Story, reason: "推荐" }], [center]);
    const expected = geographicCityScore(center, payload as Story);
    expect(result[1].story.cityScore).toBeCloseTo(expected, 10);
    expect(result[1].story.cityScore).not.toBe(0.5);
  });

  it("不会把城市相异偏好产生的翻转分数用于星空位置", () => {
    const recommendation = story("same-city", "published");
    recommendation.cityScore = 0;
    const result = mergeLobbyStories([{ story: recommendation, reason: "城市相异推荐" }], [story("mine", "published")]);

    expect(result[1].story.cityScore).toBe(1);
  });

  it("英文呈现使用翻译内容，但不修改原始故事对象", () => {
    const source = story("translated", "published");
    source.cityNameEn = "Shanghai";
    const translated = applyStoryTranslation(
      source,
      {
        title: "A new beginning",
        excerpt: "A short translated excerpt.",
        body: "This is the complete translated story body.",
        themes: ["Growth", "Choice"],
        emotion: "At peace",
        stage: "Early adulthood",
        people: ["Myself"],
        city: "Shanghai",
        translatedAt: "2026-08-17T00:00:00Z",
      },
      "en",
    );

    expect(translated.title).toBe("A new beginning");
    expect(translated.city).toBe("Shanghai");
    expect(translated.theme).toBe("Growth");
    expect(source.title).toBe("translated");
    expect(source.body).toContain("这是一个用于测试的故事正文");
  });

  it("英文界面优先使用英文城市名，避免旧翻译缓存显示中文城市", () => {
    const source = story("translated-city", "published");
    source.city = "上海";
    source.cityNameEn = "Shanghai";

    const translated = applyStoryTranslation(
      source,
      {
        title: "A story in Shanghai",
        excerpt: "A translated excerpt.",
        body: "This is the complete translated story body.",
        themes: ["Growth", "Family"],
        emotion: "Warm",
        stage: "Middle adulthood",
        people: ["Family"],
        city: "上海",
        translatedAt: "2026-08-22T00:00:00Z",
      },
      "en",
    );

    expect(translated.city).toBe("Shanghai");

    source.cityNameEn = "";
    expect(
      applyStoryTranslation(
        source,
        {
          title: "A story in Shanghai",
          excerpt: "A translated excerpt.",
          body: "This is the complete translated story body.",
          themes: ["Growth", "Family"],
          emotion: "Warm",
          stage: "Middle adulthood",
          people: ["Family"],
          city: "上海",
          translatedAt: "2026-08-22T00:00:00Z",
        },
        "en",
      ).city,
    ).toBe("Shanghai");
  });

  it("英文原文在中文界面使用中文缓存，但不修改英文原文对象", () => {
    const source = {
      ...story("english-source", "published"),
      title: "A new beginning",
      body: "This is the original English story body.",
      city: "London",
      themes: ["Growth", "Choice"],
    };
    const translated = applyStoryTranslation(
      source,
      {
        title: "新的开始",
        excerpt: "一段中文摘要。",
        body: "这是完整的中文故事译文。",
        themes: ["个人成长", "人生选择"],
        emotion: "平和",
        stage: "成年早期",
        people: ["自己"],
        city: "伦敦",
        translatedAt: "2026-08-22T00:00:00Z",
      },
      "zh",
    );

    expect(translated.title).toBe("新的开始");
    expect(translated.city).toBe("伦敦");
    expect(translated.perspective).toBe("人生经验");
    expect(source.body).toBe("This is the original English story body.");
  });
});
