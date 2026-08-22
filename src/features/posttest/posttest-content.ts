import type { PosttestAnswers, PosttestScore, PosttestStep } from "../../types/domain";

export type PosttestItem = {
  id: string;
  zh: string;
  en: string;
};

export type PosttestSection = {
  step: PosttestStep;
  titleZh: string;
  titleEn: string;
  items: readonly PosttestItem[];
};

export const posttestSections: readonly PosttestSection[] = [
  {
    step: 1,
    titleZh: "故事理解与沉浸",
    titleEn: "Story comprehension and engagement",
    items: [
      {
        id: "engagement_01",
        zh: "阅读过程中，有时我很难理解故事情节。",
        en: "At points during reading, I had a hard time making sense of what was going on in the story.",
      },
      {
        id: "engagement_02",
        zh: "阅读过程中，我有时不明确故事人物的想法、动机或处境。",
        en: "At points during reading, my understanding of the characters’ thoughts, motives, or situations was unclear.",
      },
      {
        id: "engagement_03",
        zh: "阅读故事时，我的思绪经常飘到其他事情上。",
        en: "I found my mind wandering while reading the stories.",
      },
      {
        id: "engagement_04",
        zh: "我有时很难让自己的注意力一直集中在这些故事上。",
        en: "I had a hard time keeping my mind on the stories.",
      },
      {
        id: "engagement_05",
        zh: "阅读时，虽然身体仍处在现实环境中，但我的注意和意识仿佛进入了故事世界。",
        en: "While reading, my body was in the real environment, but my mind was inside the world created by the stories.",
      },
      {
        id: "engagement_06",
        zh: "这系统仿佛暂时创造了一个世界，阅读结束后，我又从那个世界回到了现实。",
        en: "The StoryVerse created a world, and that world disappeared when the reading experience ended.",
      },
      {
        id: "engagement_07",
        zh: "这些故事在情感上影响了我。",
        en: "The stories affected me emotionally.",
      },
      {
        id: "engagement_08",
        zh: "当故事主人公经历积极或消极的事情时，我的情绪也会随之发生变化。",
        en: "During the story experience, when the protagonist went through positive or negative events, my emotions changed accordingly.",
      },
    ],
  },
  {
    step: 2,
    titleZh: "公共叙事感知",
    titleEn: "Public narrative experience",
    items: [
      {
        id: "publicness_01",
        zh: "我认为本系统中的故事内容面向更广泛的公众，而不只属于少数人。",
        en: "I think the stories in StoryVerse are accessible to a broader public, rather than belonging only to a small group of people.",
      },
      {
        id: "publicness_02",
        zh: "我觉得这个系统像一个允许人们自由进入、共同浏览他人故事的公共空间。",
        en: "I feel that StoryVerse is like a public space where people can enter freely and browse others’ stories together.",
      },
      {
        id: "publicness_03",
        zh: "我觉得自己在这个系统中拥有足够且公平的故事表达机会。",
        en: "I feel that I have sufficient and fair opportunities to express my story in StoryVerse.",
      },
      {
        id: "publicness_04",
        zh: "我觉得系统中的公共叙事不会被少数用户所主导。",
        en: "I feel that public narration in StoryVerse will not be dominated by a small number of users.",
      },
      {
        id: "publicness_05",
        zh: "我认为其他用户会认真阅读我在系统中分享的故事。",
        en: "I think other users will read the stories I share in StoryVerse carefully.",
      },
      {
        id: "publicness_06",
        zh: "我认为其他用户会尝试从我的处境理解我的经历和感受。",
        en: "I think other users who read my story would try to put themselves in my shoes to understand my experiences and feelings.",
      },
      {
        id: "publicness_07",
        zh: "我认为该系统中的个人故事能够为理解社会现实、社会问题提供有价值的经验材料。",
        en: "I think the personal stories in StoryVerse can provide valuable experiential material for understanding social realities and social issues.",
      },
      {
        id: "publicness_08",
        zh: "我认为该故事系统降低普通人通过个人故事参与公共表达的门槛，是一件积极的事。",
        en: "I think it is positive that StoryVerse lowers the threshold for ordinary people to participate in public expression through personal stories.",
      },
      {
        id: "publicness_09",
        zh: "我觉得自己可以通过在该系统中分享个人经历，为理解社会议题提供新的视角。",
        en: "I feel that by sharing personal experiences in StoryVerse, I can provide new perspectives for understanding social issues.",
      },
      {
        id: "publicness_10",
        zh: "我觉得自己的故事能够对公众理解社会问题作出有意义的贡献。",
        en: "I feel that my story can make a meaningful contribution to public understanding of social issues.",
      },
    ],
  },
  {
    step: 3,
    titleZh: "内容多样性与视角",
    titleEn: "Content diversity and perspectives",
    items: [
      {
        id: "diversity_01",
        zh: "这组故事为我提供了丰富而有变化的内容。",
        en: "This set of stories provided me with rich and varied content.",
      },
      {
        id: "diversity_02",
        zh: "总体而言，这组故事彼此之间非常相似。",
        en: "Overall, the stories presented in this set are very similar to each other.",
      },
      {
        id: "diversity_03",
        zh: "我接触到了一些与自己原有看法或认识不同的观点。",
        en: "I encountered some viewpoints that were different from my original views or understanding.",
      },
      {
        id: "diversity_04",
        zh: "我接触到了一些自己平时很少主动关注的人群及其经历。",
        en: "I encountered some groups of people and their experiences that I rarely pay attention to in everyday life.",
      },
      {
        id: "diversity_05",
        zh: "当遇到与自己不同的故事时，我会尝试理解故事人物最核心的想法或理由。",
        en: "When I encounter a story different from my own, I try to understand the story character's key thoughts or reasons.",
      },
      {
        id: "diversity_06",
        zh: "当故事人物的经历与我不同时，我会把他的经历与自己的生活经验进行比较。",
        en: "When the story character's experience is different from mine, I compare their experience with my own life experience.",
      },
      {
        id: "diversity_07",
        zh: "阅读不同故事时，我会比较不同人物面对相似问题时不同的理解或选择。",
        en: "When reading different stories, I compare how different people understand or choose differently when facing similar problems.",
      },
    ],
  },
  {
    step: 4,
    titleZh: "推荐体验",
    titleEn: "Recommendation experience",
    items: [
      {
        id: "recommendation_01",
        zh: "推荐给我的故事符合我的兴趣。",
        en: "The stories recommended to me matched my interests.",
      },
      {
        id: "recommendation_02",
        zh: "推荐给我的故事很新颖。",
        en: "The stories recommended to me are novel.",
      },
      {
        id: "recommendation_03",
        zh: "推荐系统帮助我发现新内容。",
        en: "The recommender system helped me discover new stories.",
      },
      {
        id: "recommendation_04",
        zh: "推荐给我的故事具有多样性。",
        en: "The stories recommended to me are diverse.",
      },
      {
        id: "recommendation_05",
        zh: "有些故事原本不是我会主动选择的内容，但实际阅读后我觉得值得了解。",
        en: "Some stories were not what I would have actively chosen, but after reading them I found them worth understanding.",
      },
      {
        id: "recommendation_06",
        zh: "系统让我发现了一些如果没有这次推荐，我很可能不会遇到的故事。",
        en: "The system helped me discover stories that I probably would not have encountered without this recommendation.",
      },
      {
        id: "recommendation_07",
        zh: "我感觉能够控制修改我的偏好。",
        en: "I feel in control of modifying my preferences.",
      },
      {
        id: "recommendation_08",
        zh: "推荐系统允许我表达我的喜好/厌恶。",
        en: "The recommender allows me to tell what I like or dislike.",
      },
      {
        id: "recommendation_09",
        zh: "如果以后有机会，我愿意再次使用这个故事推荐系统。",
        en: "Given the opportunity, I will use this story recommender system again.",
      },
      {
        id: "recommendation_10",
        zh: "我愿意向朋友或其他人介绍这个故事推荐系统。",
        en: "I will tell my friends or other people about this story recommender system.",
      },
    ],
  },
  {
    step: 5,
    titleZh: "创作与 AI 体验",
    titleEn: "Authorship and AI experience",
    items: [
      {
        id: "authorship_ai_01",
        zh: "我对故事文本内容做出实质性贡献。",
        en: "I made a substantial contribution to the story content.",
      },
      {
        id: "authorship_ai_02",
        zh: "我对故事做关键性修改。",
        en: "I critically revised the story.",
      },
      {
        id: "authorship_ai_03",
        zh: "这份故事文本至少有一部分由我负责。",
        en: "I am responsible for at least part of this story text.",
      },
      {
        id: "authorship_ai_04",
        zh: "在之前的交互体验中，我觉得 AI 识别我的故事标签（如“家庭陪伴”“为人父母”）的整体过程很顺畅。",
        en: "In the previous interactive experience, I felt that the overall process of AI recognizing my story tags, such as “family companionship” and “Parenthood,” was smooth.",
      },
      {
        id: "authorship_ai_05",
        zh: "在之前的交互体验中，我对最终生成故事配图的结果感到满意。",
        en: "In the previous interactive experience, I was satisfied with the outcome of the final generated story image.",
      },
      {
        id: "authorship_ai_06",
        zh: "我能够理解该系统中的 AIGC 生成图像传达的符号意义或叙事内容。",
        en: "I am able to understand the symbolic meanings or narrative content conveyed in the AIGC-generated images in this system.",
      },
    ],
  },
] as const;

export const posttestItems = posttestSections.flatMap((section) => section.items);
export const posttestItemIds = posttestItems.map((item) => item.id);

export const posttestScale = [
  { value: 1 as const, zh: "非常不同意", en: "Strongly Disagree" },
  { value: 2 as const, zh: "不同意", en: "Disagree" },
  { value: 3 as const, zh: "一般", en: "Neither agree nor disagree" },
  { value: 4 as const, zh: "同意", en: "Agree" },
  { value: 5 as const, zh: "非常同意", en: "Strongly Agree" },
] as const;

export function isPosttestScore(value: unknown): value is PosttestScore {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5;
}

export function missingPosttestItems(step: PosttestStep, answers: PosttestAnswers) {
  const section = posttestSections[step - 1];
  return section.items.filter((item) => !isPosttestScore(answers[item.id])).map((item) => item.id);
}
