import clayStylePreview from "../../assets/image-styles/clay-3d.webp";
import indieZineStylePreview from "../../assets/image-styles/indie-zine.webp";
import retroCollageStylePreview from "../../assets/image-styles/retro-collage.webp";
import type { ImageStyle } from "../../services/story-image";
import { storyBodyLengthUnits } from "../../lib/story-length";
import type {
  AppState,
  StoryDraft,
  Language,
  StoryEmotionTag,
  StoryEventTypeTag,
  StoryTagSet,
} from "../../types/domain";

export const imageStyleOptions: Array<{
  id: ImageStyle;
  label: string;
  labelEn: string;
  description: string;
  descriptionEn: string;
  preview: string;
}> = [
  // 图片仅用于帮助用户预览生成风格。
  {
    id: "clay-3d",
    label: "3D粘土风",
    labelEn: "3D clay",
    description: "定格动画般的黏土质感，手工捏塑纹理与温暖光线",
    descriptionEn: "Stop-motion clay with handmade textures, matte surfaces and warm light",
    preview: clayStylePreview,
  },
  {
    id: "indie-zine",
    label: "独立杂志风",
    labelEn: "Indie zine",
    description: "半调网点、双色印刷与大量留白的小志排版感",
    descriptionEn: "Halftone dots, two-colour riso printing and a lot of white space",
    preview: indieZineStylePreview,
  },
  {
    id: "retro-collage",
    label: "复古拼贴风",
    labelEn: "Retro collage",
    description: "撕纸层次、粉彩纸纹与温暖编辑感",
    descriptionEn: "Torn-paper layers, pastel stock, a warm editorial feel",
    preview: retroCollageStylePreview,
  },
];

/*
 * 情绪标签。id 沿用 Laros & Steenkamp 量表的英文命名（研究侧要可对照），
 * 但 en 是给用户看的界面文案，用形容词、口语化 —— 量表词当按钮太硬。
 *
 * 注意 shame 这一项：中文选的是「愧疚」，对应的是 guilt（针对具体行为），
 * 而不是 shame（针对自我）。心理学上是两种情绪，原来的 "Shame" 是误译。
 */
/* 主题标签的显示名。value 仍然是中文，这里只负责显示。 */
const themeLabelsEn: Record<string, string> = {
  家庭: "Family",
  成长: "Growing up",
  迁移: "Migration",
  关系: "Relationships",
  工作: "Work",
  身份: "Identity",
  其他: "Other",
};
export const getThemeLabel = (value: string, language: Language) =>
  language === "zh" ? value : (themeLabelsEn[value] ?? value);

export const peopleOptions = [
  { value: "自己", en: "Myself" },
  { value: "家人", en: "Family" },
  { value: "恋人", en: "Partner" },
  { value: "朋友", en: "Friends" },
  { value: "陌生人", en: "A stranger" },
  { value: "老师", en: "A teacher" },
  { value: "同事", en: "A colleague" },
  { value: "宠物/动物", en: "Pet / Animal" },
  { value: "其他", en: "Other" },
];
export const stageOptions = [
  { value: "学龄期", en: "School age" },
  { value: "青春期", en: "Adolescence" },
  { value: "成年早期", en: "Early adulthood" },
  { value: "成年中期", en: "Middle adulthood" },
  { value: "老年期", en: "Older adulthood" },
];

export const STORY_BODY_MIN_LENGTH = 100;
export const STORY_BODY_MAX_LENGTH = 1500;
export const STORY_BODY_MAX_RAW_LENGTH = 20000;

export function isStoryBodyLengthValid(body: string) {
  const length = storyBodyLengthUnits(body);
  return length >= STORY_BODY_MIN_LENGTH && length <= STORY_BODY_MAX_LENGTH;
}

export { storyBodyLengthUnits };

export type RequiredStoryField = "body" | "mood" | "stage" | "city" | "age" | "gender" | "people";

export function getMissingRequiredStoryFields(draft: StoryDraft): RequiredStoryField[] {
  const missing: RequiredStoryField[] = [];
  if (!isStoryBodyLengthValid(draft.body)) missing.push("body");
  if (!draft.mood) missing.push("mood");
  if (!draft.stage) missing.push("stage");
  if (!draft.city) missing.push("city");
  if (!draft.age) missing.push("age");
  if (!draft.gender) missing.push("gender");
  if (draft.people.length === 0) missing.push("people");
  return missing;
}

export const moodOptions = [
  { id: "anger", zh: "愤怒", en: "Angry", icon: "↯" },
  { id: "fear", zh: "担心", en: "Worried", icon: "!" },
  { id: "sadness", zh: "失落", en: "Let down", icon: "☂" },
  { id: "shame", zh: "愧疚", en: "Guilty", icon: "◌" },
  { id: "contentment", zh: "平和自足", en: "At peace", icon: "○" },
  { id: "happiness", zh: "开心幸福", en: "Happy", icon: "☀" },
  { id: "love", zh: "爱", en: "Love", icon: "♥" },
  { id: "pride", zh: "自信骄傲", en: "Proud", icon: "✦" },
];

export const eventTypeTags: StoryEventTypeTag[] = [
  {
    parentType: "Relationship events",
    parentLabelZh: "关系事件",
    subtype: "Interpersonal conflict, struggle, or rejection",
    value: "interpersonal_conflict",
    labelEn: "Interpersonal conflict",
    labelZh: "冲突",
  },
  {
    parentType: "Relationship events",
    parentLabelZh: "关系事件",
    subtype: "Divorce, separation, or break-up",
    value: "break_up",
    labelEn: "Break-up",
    labelZh: "分离",
  },
  {
    parentType: "Relationship events",
    parentLabelZh: "关系事件",
    subtype: "Becoming a parent or grandparent",
    value: "parenthood",
    labelEn: "Parenthood",
    labelZh: "为人父母",
  },
  {
    parentType: "Relationship events",
    parentLabelZh: "关系事件",
    subtype: "Relationship-building, marriage, or dating",
    value: "relationship_building",
    labelEn: "Relationship-building",
    labelZh: "亲密关系建立",
  },
  {
    parentType: "Relationship events",
    parentLabelZh: "关系事件",
    subtype: "Other relationship event",
    value: "other_relationship",
    labelEn: "Other relationship event",
    labelZh: "其他关系",
  },
  {
    parentType: "Life-threatening and mortality events",
    parentLabelZh: "生命威胁与死亡事件",
    subtype: "Death",
    value: "death",
    labelEn: "Death",
    labelZh: "死亡",
  },
  {
    parentType: "Life-threatening and mortality events",
    parentLabelZh: "生命威胁与死亡事件",
    subtype: "Serious illness or health concern",
    value: "serious_illness",
    labelEn: "Serious illness",
    labelZh: "疾病",
  },
  {
    parentType: "Life-threatening and mortality events",
    parentLabelZh: "生命威胁与死亡事件",
    subtype: "Accident, injury, or assault",
    value: "accident_or_injury",
    labelEn: "Accident or injury",
    labelZh: "意外",
  },
  {
    parentType: "Life-threatening and mortality events",
    parentLabelZh: "生命威胁与死亡事件",
    subtype: "Addiction",
    value: "addiction",
    labelEn: "Addiction",
    labelZh: "成瘾",
  },
  {
    parentType: "Life-threatening and mortality events",
    parentLabelZh: "生命威胁与死亡事件",
    subtype: "Other life-threatening or mortality event",
    value: "other_life_threatening",
    labelEn: "Other life-threatening event",
    labelZh: "其他生命威胁",
  },
  {
    parentType: "Career, occupation, or job events",
    parentLabelZh: "职业、工作与事业事件",
    subtype: "Job loss, struggle, or setback",
    value: "career_setback",
    labelEn: "Career setback",
    labelZh: "事业挫折",
  },
  {
    parentType: "Career, occupation, or job events",
    parentLabelZh: "职业、工作与事业事件",
    subtype: "Job gain, achievement, or mastery",
    value: "career_achievement",
    labelEn: "Career achievement",
    labelZh: "事业高光",
  },
  {
    parentType: "Formal and informal learning events",
    parentLabelZh: "正式与非正式学习事件",
    subtype: "Receiving sage advice or mentorship",
    value: "mentorship",
    labelEn: "Mentorship",
    labelZh: "师友",
  },
  {
    parentType: "Formal and informal learning events",
    parentLabelZh: "正式与非正式学习事件",
    subtype: "Formal education",
    value: "formal_education",
    labelEn: "Formal education",
    labelZh: "求学",
  },
  {
    parentType: "Formal and informal learning events",
    parentLabelZh: "正式与非正式学习事件",
    subtype: "Self-directed learning",
    value: "self_directed_learning",
    labelEn: "Self-directed learning",
    labelZh: "自学",
  },
  {
    parentType: "Formal and informal learning events",
    parentLabelZh: "正式与非正式学习事件",
    subtype: "Behavioral transgression at school",
    value: "school_transgression",
    labelEn: "School transgression",
    labelZh: "校园违规",
  },
  {
    parentType: "Formal and informal learning events",
    parentLabelZh: "正式与非正式学习事件",
    subtype: "Other learning experience",
    value: "other_learning",
    labelEn: "Other learning experience",
    labelZh: "其他学习经历",
  },
  {
    parentType: "Recreation, leisure, or short-term travel events",
    parentLabelZh: "娱乐、休闲或短期旅行事件",
    subtype: "Not further subtyped in the article",
    value: "recreation_or_travel",
    labelEn: "Recreation or short-term travel",
    labelZh: "娱乐休闲",
  },
  {
    parentType: "Sojourn, permanent relocation, or immigration events",
    parentLabelZh: "暂居、永久迁移或移民事件",
    subtype: "Not further subtyped in the article",
    value: "relocation_or_immigration",
    labelEn: "Relocation or immigration",
    labelZh: "迁移",
  },
  {
    parentType: "Religious or spiritual events",
    parentLabelZh: "宗教或精神性事件",
    subtype: "Not further subtyped in the article",
    value: "religious_or_spiritual",
    labelEn: "Religious or spiritual event",
    labelZh: "精神",
  },
  {
    parentType: "Other or unclassifiable events",
    parentLabelZh: "其他或不可分类事件",
    subtype: "Not further subtyped in the article",
    value: "other_or_unclassifiable",
    labelEn: "Other or unclassifiable",
    labelZh: "其他",
  },
];

/*
 * draft.mood 存的是当时界面上显示的文案，所以改过英文之后，
 * 老数据里可能还是旧的量表词。这里保留一份历史别名，避免匹配不上。
 */
const legacyMoodEn: Record<string, string> = {
  Anger: "anger",
  Fear: "fear",
  Sadness: "sadness",
  Shame: "shame",
  Contentment: "contentment",
  Happiness: "happiness",
  Pride: "pride",
};

function emotionTagFromMood(mood: string): StoryEmotionTag | null {
  const legacyId = legacyMoodEn[mood];
  const match = moodOptions.find(
    (option) => [option.id, option.zh, option.en].includes(mood) || option.id === legacyId,
  );
  if (!match) return null;
  return { value: match.id, labelZh: match.zh, labelEn: match.en };
}

export const blankPrompts = {
  zh: [
    "今天想分享哪段对你影响深远的经历？",
    "有没有一件事，让现在的你和以前不一样？",
    "没有思路？看一下旁边的例子吧～=(^.^)=",
  ],
  en: [
    "What experience shaped you more than you expected?",
    "Was there a moment that made you different from who you were?",
    "Stuck? Take a look at the examples beside you ～=(^.^)=",
  ],
};

export function getFallbackEventType(guideId: string, analysis?: AppState["analysis"]): StoryEventTypeTag {
  const byGuide: Record<string, string> = {
    agency: "career_achievement",
    communion: "relationship_building",
    redemption: "career_setback",
    contamination: "interpersonal_conflict",
    exploration: "self_directed_learning",
    resolution: "relationship_building",
    other: "other_or_unclassifiable",
  };
  const text = Object.values(analysis?.tags ?? {})
    .flat()
    .join(" ");
  const inferred = text.includes("迁移")
    ? "relocation_or_immigration"
    : text.includes("家庭") || text.includes("关系")
      ? "relationship_building"
      : text.includes("工作")
        ? "career_achievement"
        : text.includes("成长")
          ? "self_directed_learning"
          : (byGuide[guideId] ?? "other_or_unclassifiable");
  return eventTypeTags.find((tag) => tag.value === inferred) ?? eventTypeTags[eventTypeTags.length - 1];
}

export function createStoryTagSet(draft: StoryDraft, analysis: AppState["analysis"]): StoryTagSet {
  const emotion =
    emotionTagFromMood(draft.mood) ??
    (analysis?.tags.emotions ?? []).map(emotionTagFromMood).find(Boolean) ??
    emotionTagFromMood("平和自足")!;
  const themeValues = (analysis?.tags.topics ?? [])
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .slice(0, 2);
  return {
    emotions: [emotion],
    eventType: getFallbackEventType(draft.guide, analysis),
    themes: (themeValues.length ? themeValues : ["成长"]).map((value) => ({ value, status: "approved" as const })),
  };
}

export function storyTagsToAnalysisTags(storyTags: StoryTagSet) {
  return {
    topics: storyTags.themes.map((tag) => tag.value),
    emotions: storyTags.emotions.map((tag) => tag.labelZh),
    meanings: [storyTags.eventType.labelZh],
  };
}
