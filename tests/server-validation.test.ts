import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PATTERN,
  GENDERS,
  LIFE_STAGES,
  SEED_STORY_BODY_MAX_LENGTH,
  SECURITY_QUESTIONS,
  normalizeUsername,
  validateDraft,
  validateFinalLabels,
  validatePassword,
  validatePasswordConfirmation,
  validateSecurityAnswer,
  validateSecurityQuestion,
} from "../supabase/functions/_shared/validation.ts";
import { draftDatabaseFields, normalizeDraftShape } from "../supabase/functions/_shared/story-data.ts";

const completeDraft = {
  guide: "agency",
  customGuide: "",
  title: "",
  body: "字".repeat(100),
  mood: "平和自足",
  stage: "成年早期",
  age: "26",
  gender: "女",
  city: "北京",
  cityLat: 39.9042,
  cityLon: 116.4074,
  people: ["自己"],
};

describe("服务端账号校验", () => {
  it("账号只接受 4–20 位字母、数字和下划线，并统一为小写", () => {
    expect(ACCOUNT_PATTERN.test("Story_User_01")).toBe(true);
    expect(normalizeUsername(" Story_User_01 ")).toBe("story_user_01");
    expect(() => normalizeUsername("中文账号")).toThrow();
  });

  it("密码必须是 10–72 位", () => {
    expect(validatePassword("1234567890")).toBe("1234567890");
    expect(() => validatePassword("123456789")).toThrow();
    expect(() => validatePassword("a".repeat(73))).toThrow();
  });

  it("注册、找回和修改密码都必须验证两次密码一致", () => {
    expect(validatePasswordConfirmation("1234567890", "1234567890")).toBe("1234567890");
    expect(() => validatePasswordConfirmation("1234567890", "1234567891")).toThrow("两次输入的密码不一致");
  });

  it("密保问题只能来自前端提供的三项，答案限制 2–80 字", () => {
    expect(SECURITY_QUESTIONS).toEqual(["first_school", "childhood_place", "first_pet"]);
    expect(validateSecurityQuestion("childhood_place")).toBe("childhood_place");
    expect(() => validateSecurityQuestion("自定义问题")).toThrow();
    expect(validateSecurityAnswer("学校")).toBe("学校");
    expect(() => validateSecurityAnswer("a")).toThrow();
    expect(() => validateSecurityAnswer("字".repeat(81))).toThrow();
  });
});

describe("服务端故事校验", () => {
  it("使用唯一的五个人生阶段", () => {
    expect(LIFE_STAGES).toEqual(["学龄期", "青春期", "成年早期", "成年中期", "老年期"]);
    expect(() => validateDraft({ ...completeDraft, stage: "初入职场" })).toThrow();
  });

  it("正文边界严格保持 100–1500 字", () => {
    expect(validateDraft(completeDraft).body.length).toBe(100);
    expect(validateDraft({ ...completeDraft, body: "字".repeat(1500) }).body.length).toBe(1500);
    expect(() => validateDraft({ ...completeDraft, body: "字".repeat(99) })).toThrow();
    expect(() => validateDraft({ ...completeDraft, body: "字".repeat(1501) })).toThrow();
  });

  it("英文按词数校验而不是按字符数校验", () => {
    const oneHundredWords = Array.from({ length: 100 }, (_, index) => `word${index}`).join(" ");
    const ninetyNineWords = Array.from({ length: 99 }, (_, index) => `word${index}`).join(" ");
    const fifteenHundredWords = Array.from({ length: 1500 }, (_, index) => `word${index}`).join(" ");
    const fifteenHundredOneWords = `${fifteenHundredWords} extra`;
    expect(validateDraft({ ...completeDraft, body: oneHundredWords }).body).toBe(oneHundredWords);
    expect(validateDraft({ ...completeDraft, body: fifteenHundredWords }).body).toBe(fifteenHundredWords);
    expect(() => validateDraft({ ...completeDraft, body: ninetyNineWords })).toThrow();
    expect(() => validateDraft({ ...completeDraft, body: fifteenHundredOneWords })).toThrow();
  });

  it("授权冷启动故事可以保留长篇正文，但普通用户上限不变", () => {
    const authorisedSeedBody = "字".repeat(1704);
    expect(() => validateDraft({ ...completeDraft, body: authorisedSeedBody })).toThrow();
    expect(
      validateDraft({ ...completeDraft, body: authorisedSeedBody }, false, {
        maxBodyLength: SEED_STORY_BODY_MAX_LENGTH,
      }).body,
    ).toBe(authorisedSeedBody);
  });

  it.each([
    ["年龄", { age: "" }],
    ["性别", { gender: "" }],
    ["人生阶段", { stage: "" }],
    ["城市", { city: "" }],
    ["情绪", { mood: "" }],
    ["故事人物", { people: [] }],
  ])("%s 缺失时拒绝提交", (_label, patch) => {
    expect(() => validateDraft({ ...completeDraft, ...patch })).toThrow();
  });

  it("性别只接受界面提供的三个规范值", () => {
    expect(GENDERS).toEqual(["男", "女", "其他"]);
    for (const gender of GENDERS) expect(validateDraft({ ...completeDraft, gender }).gender).toBe(gender);
    expect(() => validateDraft({ ...completeDraft, gender: "伪造值" })).toThrow();
  });

  it("宠物/动物选项能通过服务端校验并原样写入数据库字段", () => {
    const validated = validateDraft({ ...completeDraft, people: ["自己", "宠物/动物"] });
    expect(validated.people).toEqual(["自己", "宠物/动物"]);
    expect(draftDatabaseFields(normalizeDraftShape(validated)).people).toEqual(["自己", "宠物/动物"]);
  });

  it("经纬度接受边界值并拒绝越界或非数字", () => {
    expect(validateDraft({ ...completeDraft, cityLat: -90, cityLon: 180 }).cityLat).toBe(-90);
    expect(validateDraft({ ...completeDraft, cityLat: 90, cityLon: -180 }).cityLon).toBe(-180);
    expect(() => validateDraft({ ...completeDraft, cityLat: 90.0001 })).toThrow();
    expect(() => validateDraft({ ...completeDraft, cityLon: -180.0001 })).toThrow();
    expect(() => validateDraft({ ...completeDraft, cityLat: "not-a-number" as unknown as number })).toThrow();
  });

  it("正式分析必须同时具有经纬度，草稿仍可暂存空坐标", () => {
    expect(() => validateDraft({ ...completeDraft, cityLat: null, cityLon: null })).toThrow("请从搜索结果中选择城市");
    expect(() => validateDraft({ ...completeDraft, cityLat: 39.9042, cityLon: null }, true)).toThrow(
      "城市坐标超出有效范围",
    );
    expect(validateDraft({ ...completeDraft, cityLat: null, cityLon: null }, true)).toMatchObject({
      cityLat: null,
      cityLon: null,
    });
  });

  it("标题允许为空", () => {
    expect(validateDraft(completeDraft).title).toBe("");
  });

  it("未完成草稿的空年龄保存为 null，而不是错误的 0 岁", () => {
    const incomplete = validateDraft({ ...completeDraft, body: "", age: "", cityLat: null, cityLon: null }, true);
    expect(incomplete.age).toBeNull();
    expect(normalizeDraftShape(incomplete).age).toBeNull();
    expect(normalizeDraftShape(incomplete).cityLat).toBeNull();
    expect(normalizeDraftShape(incomplete).cityLon).toBeNull();
  });
});

describe("服务端最终标签校验", () => {
  it("类型必须来自 21 类，并且主题恰好两个且不重复", () => {
    expect(validateFinalLabels("career_achievement", ["职业成长", "自我肯定"])).toEqual({
      typeId: "career_achievement",
      themes: ["职业成长", "自我肯定"],
    });
    expect(() => validateFinalLabels("career", ["职业成长", "自我肯定"])).toThrow();
    expect(() => validateFinalLabels("career_achievement", ["职业成长", "职业成长"])).toThrow();
  });

  it("中文主题限制 2–6 字，英文主题限制 1–3 个词", () => {
    expect(() => validateFinalLabels("career_achievement", ["长", "自我肯定"])).toThrow();
    expect(() => validateFinalLabels("career_achievement", ["这是超过六个字的主题", "自我肯定"])).toThrow();
    expect(() => validateFinalLabels("career_achievement", ["a theme with four words", "self growth"])).toThrow();
  });
});
