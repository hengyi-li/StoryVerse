import { cityByName } from "../../data/cities";
import type { Language, Story } from "../../types/domain";

const genderLabelsEn: Record<string, string> = {
  男: "Male",
  女: "Female",
  其他: "Other",
};

const genderLabelsZh: Record<string, string> = {
  Male: "男",
  male: "男",
  Female: "女",
  female: "女",
  Other: "其他",
  other: "其他",
};

export function storyPanelIdentity(story: Pick<Story, "gender" | "age" | "city" | "cityNameEn">, language: Language) {
  const gender = story.gender
    ? language === "en"
      ? (genderLabelsEn[story.gender] ?? story.gender)
      : (genderLabelsZh[story.gender] ?? story.gender)
    : "";
  const age =
    typeof story.age === "number" && Number.isFinite(story.age) && story.age > 0
      ? language === "zh"
        ? `${story.age}岁`
        : `${story.age} years old`
      : "";
  const city =
    language === "en"
      ? story.cityNameEn?.trim() || cityByName.get(story.city.trim())?.nameEn || story.city.trim()
      : story.city.trim();
  return [gender, age, city].filter(Boolean).join(" · ");
}

/** 地点已经移到卡片顶部；下方只展示主题和人生阶段标签。 */
export function storyPanelTags(story: Pick<Story, "themes" | "theme" | "stage">) {
  const themes = story.themes?.length ? story.themes : [story.theme];
  return [...new Set([...themes, story.stage].map((value) => value.trim()).filter(Boolean))];
}
