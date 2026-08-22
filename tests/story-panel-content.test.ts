import { describe, expect, it } from "vitest";
import { storyPanelIdentity, storyPanelTags } from "../src/features/star-lobby/story-panel-content";

describe("StarLobby 故事阅读卡片信息", () => {
  it("顶部按性别、年龄、地点顺序显示，中英文分别本地化", () => {
    const story = { gender: "女", age: 26, city: "北京" };
    expect(storyPanelIdentity(story, "zh")).toBe("女 · 26岁 · 北京");
    expect(storyPanelIdentity({ ...story, city: "Beijing" }, "en")).toBe("Female · 26 years old · Beijing");
    expect(storyPanelIdentity({ gender: "Male", age: 30, city: "伦敦" }, "zh")).toBe("男 · 30岁 · 伦敦");
  });

  it("英文原文故事也会把本地城市名显示成英文", () => {
    expect(storyPanelIdentity({ gender: "Female", age: 51, city: "德黑兰" }, "en")).toBe(
      "Female · 51 years old · Tehran",
    );
    expect(storyPanelIdentity({ gender: "Female", age: 51, city: "德黑兰", cityNameEn: "Tehran" }, "en")).toBe(
      "Female · 51 years old · Tehran",
    );
  });

  it("下方标签保留主题和人生阶段，不再重复地点", () => {
    expect(storyPanelTags({ themes: ["重新开始", "家庭支持"], theme: "重新开始", stage: "成年早期" })).toEqual([
      "重新开始",
      "家庭支持",
      "成年早期",
    ]);
  });
});
