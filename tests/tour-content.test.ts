import { describe, expect, it } from "vitest";
import { getScene } from "../src/features/tour/tour-content";

describe("StarLobby 新手引导文案", () => {
  it("说明颜色对应故事类型而不是主题", () => {
    const skyGuide = getScene("starLobby").steps[1];
    expect(skyGuide.zh.body).toContain("颜色 —— 对应不同的类型");
    expect(skyGuide.zh.body).not.toContain("颜色 —— 对应故事的主题");
    expect(skyGuide.en.body).toContain("Colour — different story types");
  });

  it("不再引导已经删除的写故事加号", () => {
    const steps = getScene("starLobby").steps;
    expect(steps).toHaveLength(8);
    expect(steps.some((step) => step.target === "[data-tour='nav-write']")).toBe(false);
    expect(steps.at(-1)?.target).toBe("[data-tour='account-dock']");
  });
});

describe("StoryPage 新手引导文案", () => {
  it("展示当前的五项可编辑信息且不再提到时间", () => {
    const detailsGuide = getScene("confirm").steps[1];
    expect(detailsGuide.zh.body).toContain("标题、地点、年龄、性别、人生阶段");
    expect(detailsGuide.zh.body).not.toContain("时间");
    expect(detailsGuide.en.body).toContain("Title, place, age, gender, and life stage");
    expect(detailsGuide.en.body).not.toContain("time");
  });

  it("只介绍当前保留的三种图片风格", () => {
    const imageStyleGuide = getScene("confirm").steps[3];
    expect(imageStyleGuide.zh.body).toContain("3D粘土、独立杂志、复古拼贴");
    expect(imageStyleGuide.zh.body).not.toContain("卡通蜡笔");
    expect(imageStyleGuide.zh.body).not.toContain("简约写实");
  });
});
