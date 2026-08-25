export type StoryTheme = string;
export type ResonanceMode = "similar" | "different";
export type StoryReaction = "like" | "dislike";
export type StoryStatus =
  "draft" | "analyzing" | "pending_review" | "needs_confirmation" | "published" | "private" | "needs_edit" | "removed";
export type Language = "zh" | "en";
export type ThemeReviewStatus = "approved";
export type ScreenId =
  "intro" | "pretest" | "posttest" | "storyEditor" | "resonance" | "recommendations" | "starLobby" | "admin";
export type StoryEditorStep = 0 | 1 | 2 | 3;
export type TourSceneId = "starLobby" | "guide" | "collection" | "confirm" | "resonance";
export type ResonancePreferences = Record<"city" | "stage" | "theme", ResonanceMode>;

export interface RecommendationScores {
  rank: number;
  city_score: number;
  life_score: number;
  theme_score: number;
  semantic_score: number;
  final_score: number;
}

export type PretestStatus = "not_required" | "not_started" | "in_progress" | "completed" | "declined";
export type PretestStep = 1 | 2 | 3 | 4;

export interface PretestAnswers {
  consented: boolean;
  birthYear: number | null;
  gender: string;
  residenceRegion: string;
  countryRegion: string;
  province: string;
  city: string;
  communityType: string;
  ethnicity: string;
  education: string;
  educationOther: string;
  employment: string;
  industryPrimary: string;
  industrySecondary: string;
  discipline: string;
  major: string;
}

export interface PretestProgress {
  required: boolean;
  status: PretestStatus;
  currentStep: PretestStep;
  questionnaireVersion: "pretest_v1";
  draft: PretestAnswers | null;
  consentedAt?: string | null;
  submittedAt?: string | null;
  declinedAt?: string | null;
}

export type PosttestStatus = "not_required" | "not_started" | "in_progress" | "completed";
export type PosttestStep = 1 | 2 | 3 | 4 | 5;
export type PosttestScore = 1 | 2 | 3 | 4 | 5;
export type PosttestAnswers = Record<string, PosttestScore>;

export interface PosttestProgress {
  required: boolean;
  status: PosttestStatus;
  currentStep: PosttestStep;
  questionnaireVersion: "posttest_v1";
  answers: PosttestAnswers;
  reminderDismissedAt: string | null;
  submittedAt: string | null;
}

export interface StoryEmotionTag {
  value: string;
  labelZh: string;
  labelEn?: string;
}

export interface StoryEventTypeTag {
  parentType: string;
  parentLabelZh: string;
  subtype: string;
  value: string;
  labelEn: string;
  labelZh: string;
}

export interface StoryThemeTag {
  value: string;
  status: ThemeReviewStatus;
}

export interface StoryTagSet {
  emotions: StoryEmotionTag[];
  eventType: StoryEventTypeTag;
  themes: StoryThemeTag[];
}

export interface Story {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  author: string;
  city: string;
  cityNameEn?: string;
  stage: string;
  age?: number;
  gender?: string;
  theme: StoryTheme;
  emotion: string;
  meaning: string;
  perspective: string;
  people: string[];
  readMinutes: number;
  tags?: StoryTagSet;
  typeId?: string;
  typeColor?: string;
  typeLabelZh?: string;
  typeLabelEn?: string;
  themes?: string[];
  ownedByCurrentUser?: boolean;
  status?: StoryStatus;
  imageUrl?: string;
  similarityScore?: number;
  /** 地理位置换算出的城市接近度，1 表示同城，越小表示越远。 */
  cityScore?: number;
  latitude?: number | null;
  longitude?: number | null;
  /** StarLobby 中作为当前用户参照点、固定在原点的故事。 */
  isCenterStory?: boolean;
  /** 生成当前推荐位置的可追溯批次；作者自己的中心故事没有推荐批次。 */
  recommendationBatchId?: string;
  recommendationRank?: number;
  recommendationScores?: RecommendationScores;
  recommendationReason?: string;
  visualStatus: "none" | "ready" | "generating" | "failed" | "blocked";
  /** 已缓存的目标语言版本；原文始终保留在 Story 自身字段中。 */
  translations?: Partial<Record<Language, StoryTranslation>>;
  x: number;
  y: number;
}

export interface StoryTranslation {
  title: string;
  excerpt: string;
  body: string;
  themes: string[];
  emotion: string;
  stage: string;
  people: string[];
  city?: string;
  translatedAt: string;
}

export interface StoryDraft {
  id?: string;
  version?: number;
  guide: string;
  customGuide: string;
  title: string;
  body: string;
  mood: string;
  stage: string;
  age: string;
  /** "男" | "女" | "其他" | ""（未填）。供故事配图的人物描述使用。 */
  gender: string;
  city: string;
  cityNameEn: string;
  cityCountry: string;
  cityLat: number | null;
  cityLon: number | null;
  people: string[];
  startedAt: number;
  edits: number;
  pastedChars: number;
  saves: number;
  savedAt: number;
}

export interface SavedDraft extends StoryDraft {
  id: string;
  version: number;
  savedAt: number;
}

export interface StoryAnalysis {
  id?: string;
  suggestedTitle: string;
  tags: {
    topics: string[];
    emotions: string[];
    meanings: string[];
    perspectives: string[];
  };
  arc: string[];
  storyTags?: StoryTagSet;
  workflowStatus?: StoryStatus;
  moderationDecision?: "pass" | "human_review";
}

/** 进入人工审核区的三种来源 */
export type ReviewBucket =
  | "reported" // 被其它用户举报
  | "uncertain" // 审核系统不确定是否违规（用户选了「仍然提交」）
  | "appealed"; // 系统误判（作者本人申诉）

export type ReviewStatus = "pending" | "kept" | "removed";

/** 服务端机审可能返回的内部关注类别。 */
export type ModerationFlag = "privacy" | "attack" | "distress" | "crisis" | "hate" | "minor" | "explicit" | "spam";

export interface ReviewItem {
  id: string;
  /** 对应星图上的星点 id；有值时下架会让那颗星消失 */
  storyId?: string;
  title: string;
  body: string;
  tags: string[];
  author: string;
  city: string;
  createdAt: number;
  bucket: ReviewBucket;
  status: ReviewStatus;
  /** 被举报时：举报次数与理由 */
  reportCount?: number;
  reportReasons?: string[];
  /** 机器审核命中的类别 */
  flags?: ModerationFlag[];
  /** 作者申诉时写的说明 */
  appealNote?: string;
  /** 管理员下架时填的理由，会推送到作者收件箱 */
  removalReason?: string;
  /** 是否是当前用户写的，用来决定收件箱要不要收到通知 */
  ownedByCurrentUser?: boolean;
  /**
   * 审核台内部状态：这条有没有被审核人员打开过。
   * 没打开 = 待审核，打开过 = 审核中。和 status（pending/kept/removed）是两回事 ——
   * status 说的是「处理完了没有」，hasBeenOpened 说的是「有没有人正在看」。
   */
  hasBeenOpened?: boolean;
}

/**
 * 通知的三种状态，对应人工审核的生命周期：
 *   pending   —— 已提交，还没人看（进队列时创建）
 *   reviewing —— 审核人员已经打开了这条（在审核台点开时切换）
 *   resolved  —— 已有结果，kind 才有意义（保留 / 下架）
 */
export type InboxStatus = "pending" | "reviewing" | "resolved";

export interface InboxMessage {
  id: string;
  status: InboxStatus;
  kind: "removed" | "kept" | "needs_edit" | "flagged" | "system";
  storyTitle: string;
  reason: string;
  createdAt: number;
  read: boolean;
}

export interface UserProfile {
  id: string;
  accountIdentifier: string;
  displayName: string;
  anonymousNumber: number;
  role: "user" | "admin";
  status: "active" | "suspended";
  pretestRequired: boolean;
  resonanceExperimentCondition: "all_similar" | "all_different" | null;
}

export interface AppState {
  language: Language;
  /** 防止同一浏览器中的不同账号共享本地草稿与分析状态。 */
  accountScopeId: string;
  hasCompletedFirstStory: boolean;
  screen: ScreenId;
  storyEditorStep: StoryEditorStep;
  openedRecommendationStoryIds: string[];
  resonance: ResonancePreferences;
  reactions: Record<string, StoryReaction | null>;
  draft: StoryDraft;
  analysis: StoryAnalysis | null;
  /**
   * 新手引导。enabled 为 true 表示还在引导流程里（首次访问的默认值）；
   * seen 记录已经播放完的场景，避免退回上一步时重复弹出。
   */
  tour: { enabled: boolean; seen: TourSceneId[] };
  /** 作者收件箱：下架通知、审核结果等 */
  inbox: InboxMessage[];
  /** 当前服务端会话是否具有管理员角色；刷新时始终由服务端重新确认。 */
  isAdmin: boolean;
}
