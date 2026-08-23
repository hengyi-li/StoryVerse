import { describe, expect, it } from "vitest";
import {
  buildStoryImageFallbackPrompt,
  buildStoryImagePrompt,
  STORY_IMAGE_PROMPT_MARKER,
} from "../supabase/functions/_shared/image-prompt.ts";

describe("故事图片 Prompt", () => {
  it("完整注入标题、地点、年龄、性别、人生阶段和正文", () => {
    const prompt = buildStoryImagePrompt({
      title: "河边的那个冬天",
      body: "那年冬天，我每天傍晚都会经过河边，后来在那里认识了影响我很久的一位朋友。",
      city: "上海",
      city_country: "中国",
      age: 26,
      gender: "男",
      life_stage: "成年早期",
      people: ["自己", "朋友"],
      mood: "平和自足",
      final_themes: ["城市归属", "陌生善意"],
    });

    expect(prompt.startsWith(STORY_IMAGE_PROMPT_MARKER)).toBe(true);
    expect(prompt).toContain("故事标题：河边的那个冬天");
    expect(prompt).toContain("地点：上海，中国");
    expect(prompt).toContain("叙事者当时的年龄：26 岁");
    expect(prompt).toContain("叙事者性别：男");
    expect(prompt).toContain("叙事者当时所处的人生阶段：成年早期");
    expect(prompt).toContain("故事中的人物：自己、朋友");
    expect(prompt).toContain("故事正文：");
    expect(prompt).toContain("不要擅自改变叙事者的性别或年龄段");
    expect(prompt).toContain("绝不能据此推断人物的国籍、民族、宗教信仰、文化身份或生活方式");
    expect(prompt).toContain("人物穿着不得因城市、国家或地区而做特殊处理");
    expect(prompt).toContain("绝对禁止出现或强化任何特定民族服饰、宗教或信仰服饰");
  });

  it("标题为空时使用 AI 建议标题", () => {
    expect(buildStoryImagePrompt({ title: "", ai_suggested_title: "重新出发" })).toContain("故事标题：重新出发");
  });

  it("敏感输入回退仍保留决定人物与场景的字段，但不再发送完整正文", () => {
    const body = "我小时候生活很困难。后来经历了一段很长、可能触发绘图模型输入过滤的真实叙述。";
    const prompt = buildStoryImageFallbackPrompt({
      title: "后来生活变好了",
      body,
      city: "遵义",
      age: 81,
      gender: "男",
      life_stage: "成年早期",
      people: ["自己", "家人"],
      mood: "开心幸福",
      final_themes: ["生活变迁", "感恩"],
    });

    expect(prompt.startsWith(STORY_IMAGE_PROMPT_MARKER)).toBe(true);
    expect(prompt).toContain("故事标题：后来生活变好了");
    expect(prompt).toContain("地点：遵义");
    expect(prompt).toContain("叙事者当时的年龄：81 岁");
    expect(prompt).toContain("叙事者性别：男");
    expect(prompt).toContain("叙事者当时所处的人生阶段：成年早期");
    expect(prompt).toContain("代表性瞬间：我小时候生活很困难");
    expect(prompt).toContain("人物穿着不得因城市、国家或地区而做特殊处理");
    expect(prompt).toContain("绝对禁止出现或强化任何特定民族服饰、宗教或信仰服饰");
    expect(prompt).not.toContain(body);
  });
});
