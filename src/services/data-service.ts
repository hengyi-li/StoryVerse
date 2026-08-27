import { assertSupabaseConfigured, supabase } from "../lib/supabase";
import { geographicCityScore } from "../lib/geo-distance";
import { functionRegionFor } from "../lib/function-region";
import { cityByName } from "../data/cities";
import type {
  InboxMessage,
  RecommendationScores,
  ResonancePreferences,
  SavedDraft,
  Story,
  StoryAnalysis,
  StoryDraft,
  Language,
  PosttestAnswers,
  PosttestProgress,
  PosttestStep,
  PretestAnswers,
  PretestProgress,
  PretestStep,
  StoryReaction,
  StoryStatus,
  StoryTranslation,
  UserProfile,
} from "../types/domain";
import { resonanceExperimentCondition } from "../lib/resonance-experiment";

export class DataServiceError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "DataServiceError";
  }
}

export type StoryRecommendation = {
  story: Story;
  reason: string;
  batchId?: string;
  scores?: RecommendationScores;
};

export type StoryProgress = {
  story: Story;
  draft: StoryDraft;
  analysis: StoryAnalysis;
  status: StoryStatus;
};

export type StoryImageGeneration = {
  status: "queued" | "generating" | "ready" | "failed";
  imageUrl?: string;
  imageStyle?: string;
  highlight?: { title: string; moment: string; scene: string; action: string; emotion: string };
  imagePrompt?: string;
  error?: string;
  reused?: boolean;
  retryAfterMs?: number;
};

/**
 * StarLobby must be based on the current published-story pool. Keep the refresh
 * and read sequence in one place so login, reload and every lobby entry cannot
 * accidentally read a historical recommendation batch.
 */
export async function refreshBeforeLobbyLoad<T>(refresh: () => Promise<unknown>, load: () => Promise<T>): Promise<T> {
  await refresh();
  return load();
}

const resumableStoryStatuses: StoryStatus[] = ["analyzing", "pending_review", "needs_confirmation"];

const emotionLabels: Record<string, { value: string; zh: string; en: string }> = {
  愤怒: { value: "anger", zh: "愤怒", en: "Angry" },
  担心: { value: "fear", zh: "担心", en: "Worried" },
  失落: { value: "sadness", zh: "失落", en: "Let down" },
  愧疚: { value: "shame", zh: "愧疚", en: "Guilty" },
  平和自足: { value: "contentment", zh: "平和自足", en: "At peace" },
  开心幸福: { value: "happiness", zh: "开心幸福", en: "Happy" },
  爱: { value: "love", zh: "爱", en: "Love" },
  自信骄傲: { value: "pride", zh: "自信骄傲", en: "Proud" },
};

function withRecommendationMetadata(item: StoryRecommendation): StoryRecommendation {
  return {
    ...item,
    story: {
      ...item.story,
      recommendationBatchId: item.batchId,
      recommendationRank: item.scores?.rank == null ? undefined : Number(item.scores.rank),
      recommendationScores: item.scores,
      recommendationReason: item.reason,
    },
  };
}

export function mergeLobbyStories(recommendations: StoryRecommendation[], ownedStories: Story[]) {
  const visibleOwnedStories = ownedStories.filter((story) =>
    ["published", "pending_review", "private", "needs_edit"].includes(String(story.status)),
  );
  const centerStory = visibleOwnedStories.find((story) => story.status === "published") ?? visibleOwnedStories[0];
  const ownedIds = new Set(visibleOwnedStories.map((story) => story.id));
  return [
    ...visibleOwnedStories.map((story) => ({
      story: {
        ...story,
        cityScore: centerStory ? geographicCityScore(centerStory, story) : 0.5,
        isCenterStory: story.id === centerStory?.id,
      },
      reason: story.status === "published" ? "我的公开故事" : "仅自己可见",
    })),
    ...recommendations
      .filter((item) => !ownedIds.has(item.story.id))
      .map((item) => ({
        ...item,
        story: {
          ...item.story,
          /*
           * 推荐批次里的 city_score 已经按“相近 / 相异”偏好翻转，只适合排序。
           * 星空半径必须始终表达真实地理距离，因此有中心故事时重新用经纬度计算。
           */
          cityScore: centerStory ? geographicCityScore(centerStory, item.story) : (item.story.cityScore ?? 0.5),
          isCenterStory: false,
        },
      })),
  ];
}

type FunctionErrorWithContext = Error & { context?: Response };

async function functionError(error: unknown): Promise<DataServiceError> {
  const candidate = error as FunctionErrorWithContext;
  try {
    const payload = (await candidate.context?.clone().json()) as { error?: string; code?: string } | undefined;
    if (payload?.error) return new DataServiceError(payload.error, payload.code ?? "FUNCTION_ERROR");
  } catch {
    // The function may have returned a non-JSON gateway error.
  }
  return new DataServiceError(candidate?.message || "服务暂时不可用，请稍后重试。", "FUNCTION_ERROR");
}

async function invoke<T>(name: string, body?: unknown, method: "GET" | "POST" = "POST"): Promise<T> {
  assertSupabaseConfigured();
  const { data, error } = await supabase.functions.invoke(name, {
    body: body as Record<string, unknown> | undefined,
    method,
    region: functionRegionFor(name, import.meta.env.VITE_SUPABASE_URL),
  });
  if (error) throw await functionError(error);
  return data as T;
}

function profileFromRow(row: Record<string, unknown>): UserProfile {
  const accountIdentifier = String(row.username ?? "");
  return {
    id: String(row.id),
    accountIdentifier,
    displayName: String(row.display_name ?? "StoryVerse"),
    anonymousNumber: Number(row.anonymous_number ?? 404),
    role: row.role === "admin" ? "admin" : "user",
    status: row.status === "suspended" ? "suspended" : "active",
    pretestRequired: Boolean(row.pretest_required),
    resonanceExperimentCondition: resonanceExperimentCondition(accountIdentifier),
  };
}

function draftFromRow(row: Record<string, unknown>): SavedDraft {
  return {
    id: String(row.id),
    version: Number(row.version ?? 1),
    guide: String(row.guide ?? ""),
    customGuide: String(row.custom_guide ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
    mood: String(row.mood ?? ""),
    stage: String(row.life_stage ?? ""),
    age: row.age == null ? "" : String(row.age),
    gender: String(row.gender ?? ""),
    city: String(row.city ?? ""),
    cityNameEn: String(row.city_name_en ?? ""),
    cityCountry: String(row.city_country ?? ""),
    cityLat: row.latitude == null ? null : Number(row.latitude),
    cityLon: row.longitude == null ? null : Number(row.longitude),
    people: Array.isArray(row.people) ? row.people.map(String) : [],
    startedAt: new Date(String(row.started_at ?? row.created_at)).getTime(),
    edits: Number(row.edits ?? 0),
    pastedChars: Number(row.pasted_chars ?? 0),
    saves: Number(row.saves ?? 0),
    savedAt: new Date(String(row.saved_at ?? row.updated_at)).getTime(),
  };
}

function storyFromRow(row: Record<string, unknown>): Story {
  const body = String(row.body ?? "");
  const themes = Array.isArray(row.final_themes) ? row.final_themes.map(String) : [];
  const images = Array.isArray(row.generated_images)
    ? (row.generated_images as Array<Record<string, unknown>>).filter((image) => image.status === "ready")
    : [];
  const type = row.story_type as Record<string, unknown> | null | undefined;
  images.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return {
    id: String(row.id),
    title: String(row.title || row.ai_suggested_title || "我的故事"),
    excerpt: String(row.excerpt || body.slice(0, 70)),
    body,
    author: String(row.author_display_name || "StoryVerse"),
    city: String(row.city ?? ""),
    cityNameEn: String(row.city_name_en ?? ""),
    stage: String(row.life_stage ?? ""),
    age: Number(row.age ?? 0),
    gender: String(row.gender ?? ""),
    theme: themes[0] || "成长",
    emotion: String(row.mood || "平和自足"),
    meaning: themes[1] || "自我理解",
    perspective: "人生经验",
    people: Array.isArray(row.people) ? row.people.map(String) : [],
    readMinutes: Math.max(1, Math.ceil(body.length / 420)),
    typeId: String(row.final_type_id || row.ai_type_id || "other_or_unclassifiable"),
    typeColor: type?.color ? String(type.color) : row.typeColor ? String(row.typeColor) : undefined,
    typeLabelZh: type?.label_zh ? String(type.label_zh) : undefined,
    typeLabelEn: type?.label_en ? String(type.label_en) : undefined,
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    themes,
    status: String(row.status ?? "published") as Story["status"],
    imageUrl: images[0]?.public_url ? String(images[0].public_url) : undefined,
    visualStatus:
      row.visual_status === "ready"
        ? "ready"
        : row.visual_status === "generating"
          ? "generating"
          : row.visual_status === "blocked"
            ? "blocked"
            : row.visual_status === "failed"
              ? "failed"
              : "none",
    x: 50,
    y: 50,
  };
}

export function storyProgressFromRow(
  row: Record<string, unknown>,
  type: Record<string, unknown> | null,
): StoryProgress {
  const status = String(row.status ?? "analyzing") as StoryStatus;
  const typeId = String(row.final_type_id || row.ai_type_id || "other_or_unclassifiable");
  const emotion = emotionLabels[String(row.mood ?? "")] ?? {
    value: "contentment",
    zh: String(row.mood || "平和自足"),
    en: String(row.mood || "At peace"),
  };
  const themes = (
    Array.isArray(row.final_themes) && row.final_themes.length
      ? row.final_themes.map(String)
      : Array.isArray(row.ai_themes) && row.ai_themes.length
        ? row.ai_themes.map(String)
        : ["自我理解", "人生转折"]
  ).slice(0, 2);
  const draft = draftFromRow(row);
  const analysis: StoryAnalysis = {
    id: String(row.id),
    suggestedTitle: String(row.ai_suggested_title || row.title || "我的故事"),
    tags: {
      topics: themes,
      emotions: [emotion.zh],
      meanings: [String(type?.label_zh ?? "其他")],
      perspectives: ["人生经验"],
    },
    arc: ["故事已经保存", status === "pending_review" ? "等待内容确认" : "完成安全与标签整理", "等待你的最终确认"],
    storyTags: {
      emotions: [{ value: emotion.value, labelZh: emotion.zh, labelEn: emotion.en }],
      eventType: {
        parentType: String(type?.parent_type ?? "other"),
        parentLabelZh: String(type?.parent_type ?? "其他"),
        subtype: String(type?.label_en ?? "Other"),
        value: typeId,
        labelEn: String(type?.label_en ?? "Other"),
        labelZh: String(type?.label_zh ?? "其他"),
      },
      themes: themes.map((value) => ({ value, status: "approved" as const })),
    },
    workflowStatus: status,
    moderationDecision:
      row.moderation_decision === "pass" || row.moderation_decision === "human_review"
        ? row.moderation_decision
        : undefined,
  };
  return {
    status,
    story: { ...storyFromRow({ ...row, story_type: type }), ownedByCurrentUser: true },
    draft: { ...draft, id: undefined, version: undefined },
    analysis,
  };
}

export function applyStoryTranslation(
  story: Story,
  translation: StoryTranslation | undefined,
  targetLanguage: Language,
): Story {
  if (!translation) return story;
  const themes = translation.themes.length ? translation.themes : story.themes;
  const readLength =
    targetLanguage === "en"
      ? translation.body.trim().split(/\s+/).filter(Boolean).length
      : Array.from(translation.body.trim()).length;
  return {
    ...story,
    title: translation.title,
    excerpt: translation.excerpt,
    body: translation.body,
    city:
      targetLanguage === "en"
        ? story.cityNameEn || cityByName.get(story.city)?.nameEn || translation.city || story.city
        : translation.city || story.city,
    stage: translation.stage || story.stage,
    emotion: translation.emotion || story.emotion,
    people: translation.people.length ? translation.people : story.people,
    themes,
    theme: themes?.[0] || story.theme,
    meaning: themes?.[1] || story.meaning,
    perspective: targetLanguage === "en" ? "Life experience" : "人生经验",
    readMinutes: Math.max(1, Math.ceil(readLength / (targetLanguage === "en" ? 220 : 420))),
  };
}

function storyTranslationFromRow(row: Record<string, unknown>): StoryTranslation {
  return {
    title: String(row.title ?? ""),
    excerpt: String(row.excerpt ?? ""),
    body: String(row.body ?? ""),
    themes: Array.isArray(row.themes) ? row.themes.map(String) : [],
    emotion: String(row.mood ?? ""),
    stage: String(row.life_stage ?? ""),
    people: Array.isArray(row.people) ? row.people.map(String) : [],
    city: String(row.city ?? ""),
    translatedAt: String(row.updated_at ?? ""),
  };
}

function notificationFromRow(row: Record<string, unknown>): InboxMessage {
  return {
    id: String(row.id),
    status: String(row.status) as InboxMessage["status"],
    kind: String(row.kind) as InboxMessage["kind"],
    storyTitle: String(row.story_title ?? ""),
    reason: String(row.reason ?? ""),
    createdAt: new Date(String(row.created_at)).getTime(),
    read: Boolean(row.read),
  };
}

export const dataService = {
  register: async (input: {
    accountIdentifier: string;
    password: string;
    passwordConfirmation: string;
    displayName: string;
    securityQuestion: string;
    securityAnswer: string;
  }) => {
    const result = await invoke<{
      session: { access_token: string; refresh_token: string };
      user: Record<string, unknown>;
    }>("auth-signup", input);
    const { error } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (error) throw new DataServiceError(error.message, "SESSION_ERROR");
    return { user: profileFromRow(result.user) };
  },

  login: async (input: { accountIdentifier: string; password: string }) => {
    const result = await invoke<{
      session: { access_token: string; refresh_token: string };
      user: Record<string, unknown>;
    }>("auth-login", input);
    const { error } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (error) throw new DataServiceError(error.message, "SESSION_ERROR");
    return { user: profileFromRow(result.user) };
  },

  resetPassword: (input: {
    accountIdentifier: string;
    securityQuestion: string;
    securityAnswer: string;
    password: string;
    passwordConfirmation: string;
  }) => invoke<{ updated: boolean }>("auth-recover", input),

  logout: async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw new DataServiceError(error.message, "LOGOUT_FAILED");
    return { loggedOut: true };
  },

  getPretestProgress: () => invoke<PretestProgress>("pretest", undefined, "GET"),

  savePretestStep: (step: PretestStep, answers: PretestAnswers) =>
    invoke<PretestProgress>("pretest", { action: "save", step, answers }),

  submitPretest: (answers: PretestAnswers) =>
    invoke<PretestProgress>("pretest", { action: "submit", step: 4, answers }),

  declinePretest: () => invoke<PretestProgress>("pretest", { action: "decline" }),

  getPosttestProgress: () => invoke<PosttestProgress>("posttest", undefined, "GET"),

  savePosttestStep: (step: PosttestStep, answers: PosttestAnswers) =>
    invoke<PosttestProgress>("posttest", { action: "save", step, answers }),

  submitPosttest: (answers: PosttestAnswers) =>
    invoke<PosttestProgress>("posttest", { action: "submit", step: 5, answers }),

  dismissPosttestReminder: () => invoke<PosttestProgress>("posttest", { action: "dismiss_reminder" }),

  getCurrentUser: async () => {
    assertSupabaseConfigured();
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.user) throw new DataServiceError("请先登录。", "UNAUTHENTICATED");
    const { data, error } = await supabase.from("profiles").select("*").eq("id", session.session.user.id).single();
    if (error) throw new DataServiceError(error.message, "PROFILE_UNAVAILABLE");
    const user = profileFromRow(data);
    if (user.status === "suspended") {
      await supabase.auth.signOut();
      throw new DataServiceError("这个账号目前暂时无法使用。", "ACCOUNT_SUSPENDED");
    }
    return { user };
  },

  updateProfile: async (input: {
    displayName?: string;
    accountIdentifier?: string;
    password?: string;
    feedback?: string;
  }) => {
    const { user } = await dataService.getCurrentUser();
    if (
      input.accountIdentifier &&
      input.accountIdentifier.trim().toLowerCase() !== user.accountIdentifier.toLowerCase()
    ) {
      throw new DataServiceError("登录账号创建后不能直接修改。", "USERNAME_IMMUTABLE");
    }
    if (input.displayName?.trim()) {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: input.displayName.trim() })
        .eq("id", user.id);
      if (error) throw new DataServiceError(error.message, "PROFILE_UPDATE_FAILED");
    }
    if (input.password) {
      await invoke("auth-change-password", { password: input.password, passwordConfirmation: input.password });
    }
    if (input.feedback?.trim()) await invoke("feedback", { text: input.feedback.trim() });
    return dataService.getCurrentUser();
  },

  getCurrentDraft: async (): Promise<SavedDraft | null> => {
    const { user } = await dataService.getCurrentUser();
    const { data, error } = await supabase.from("story_drafts").select("*").eq("user_id", user.id).maybeSingle();
    if (error) throw new DataServiceError(error.message, "DRAFT_UNAVAILABLE");
    return data ? draftFromRow(data) : null;
  },

  /**
   * 从数据库恢复尚未走完的故事，而不是依赖浏览器里的页面状态。
   * 传 storyId 时也用于轮询一篇仍在分析中的故事。
   */
  getStoryProgress: async (storyId?: string): Promise<StoryProgress | null> => {
    const { user } = await dataService.getCurrentUser();
    const baseQuery = supabase.from("stories").select("*").eq("user_id", user.id);
    const { data, error } = storyId
      ? await baseQuery.eq("id", storyId).maybeSingle()
      : await baseQuery
          .in("status", resumableStoryStatuses)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
    if (error) throw new DataServiceError(error.message, "STORY_PROGRESS_UNAVAILABLE");
    if (!data) return null;

    const typeId = String(data.final_type_id || data.ai_type_id || "other_or_unclassifiable");
    const { data: type, error: typeError } = await supabase
      .from("story_types")
      .select("id,parent_type,label_zh,label_en,color")
      .eq("id", typeId)
      .maybeSingle();
    if (typeError) throw new DataServiceError(typeError.message, "STORY_PROGRESS_UNAVAILABLE");
    return storyProgressFromRow(data, type);
  },

  saveDraft: async (draft: StoryDraft) => {
    const result = await invoke<{ draft: SavedDraft }>("story-save-draft", { draft });
    return result.draft;
  },

  clearDraft: async () => {
    const { user } = await dataService.getCurrentUser();
    const { error } = await supabase.from("story_drafts").delete().eq("user_id", user.id);
    if (error) throw new DataServiceError(error.message, "DRAFT_CLEAR_FAILED");
  },

  analyzeDraft: async (draft: StoryDraft, storyId?: string) => {
    const result = await invoke<{ analysis: StoryAnalysis; status: string }>("story-analyze", { draft, storyId });
    return result.analysis;
  },

  publishStory: async (draft: StoryDraft, analysis: StoryAnalysis) => {
    const typeId = analysis.storyTags?.eventType.value;
    const themes = analysis.storyTags?.themes.map((theme) => theme.value) ?? analysis.tags.topics;
    const result = await invoke<{
      story: Story;
      status: Story["status"];
      analysis?: StoryAnalysis;
      requiresConfirmation?: boolean;
    }>("story-confirm", {
      storyId: analysis.id,
      draft,
      typeId,
      themes,
      emotions: analysis.storyTags?.emotions ?? [],
    });
    return result;
  },

  listStories: async () => {
    const { data, error } = await supabase
      .from("stories")
      .select(
        "*,story_type:story_types!stories_final_type_id_fkey(color,label_zh,label_en),generated_images(public_url,status,created_at)",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(100);
    if (error) throw new DataServiceError(error.message, "STORIES_UNAVAILABLE");
    return (data ?? []).map(storyFromRow);
  },

  listOwnedStories: async () => {
    const { user } = await dataService.getCurrentUser();
    const { data, error } = await supabase
      .from("stories")
      .select(
        "*,story_type:story_types!stories_final_type_id_fkey(color,label_zh,label_en),generated_images(public_url,status,created_at)",
      )
      .eq("user_id", user.id)
      .order("published_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw new DataServiceError(error.message, "STORIES_UNAVAILABLE");
    return (data ?? []).map((row) => ({ ...storyFromRow(row), ownedByCurrentUser: true }));
  },

  listStoryTypes: async () => {
    const { data, error } = await supabase
      .from("story_types")
      .select("id,label_zh,label_en,color,sort_order,enabled")
      .eq("enabled", true)
      .order("sort_order");
    if (error) throw new DataServiceError(error.message, "STORY_TYPES_UNAVAILABLE");
    return data ?? [];
  },

  getResonancePreferences: async () => {
    const { user } = await dataService.getCurrentUser();
    const { data, error } = await supabase
      .from("resonance_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw new DataServiceError(error.message, "RESONANCE_UNAVAILABLE");
    return {
      city: data?.city_mode ?? "similar",
      stage: data?.stage_mode ?? "different",
      theme: data?.theme_mode ?? "similar",
    } as ResonancePreferences;
  },

  saveResonancePreferences: async (value: ResonancePreferences) => {
    const { user } = await dataService.getCurrentUser();
    const { error } = await supabase
      .from("resonance_preferences")
      .upsert(
        { user_id: user.id, city_mode: value.city, stage_mode: value.stage, theme_mode: value.theme },
        { onConflict: "user_id" },
      );
    if (error) throw new DataServiceError(error.message, "RESONANCE_SAVE_FAILED");
    return value;
  },

  listRecommendations: async (): Promise<StoryRecommendation[]> => {
    let result = await invoke<{ recommendations: StoryRecommendation[] }>("recommendations-current");
    if (!result.recommendations.length) {
      result = await invoke<{ recommendations: StoryRecommendation[] }>("recommendations-refresh");
    }
    return result.recommendations.map((raw) => {
      const item = withRecommendationMetadata(raw);
      return {
        ...item,
        story: {
          ...item.story,
          similarityScore: Number(item.scores?.semantic_score ?? item.scores?.final_score ?? 0.5),
        },
      };
    });
  },

  refreshRecommendations: async (): Promise<StoryRecommendation[]> => {
    const result = await invoke<{ recommendations: StoryRecommendation[] }>("recommendations-refresh");
    return result.recommendations.map((raw) => {
      const item = withRecommendationMetadata(raw);
      return {
        ...item,
        story: {
          ...item.story,
          similarityScore: Number(item.scores?.semantic_score ?? item.scores?.final_score ?? 0.5),
        },
      };
    });
  },

  listLobbyStories: async (): Promise<StoryRecommendation[]> => {
    const [result, ownedStories] = await Promise.all([
      refreshBeforeLobbyLoad(
        () => invoke("recommendations-refresh"),
        () => invoke<{ recommendations: StoryRecommendation[] }>("lobby-stories"),
      ),
      dataService.listOwnedStories(),
    ]);
    const recommendations = result.recommendations.map((raw) => {
      const item = withRecommendationMetadata(raw);
      return {
        ...item,
        story: {
          ...item.story,
          similarityScore: Number(item.scores?.semantic_score ?? item.scores?.final_score ?? 0.5),
          cityScore: Number(item.scores?.city_score ?? 0.5),
        },
      };
    });
    /* 推荐只排“其他用户的公开故事”，StarLobby 还必须合并作者自己的已完成故事。 */
    const merged = mergeLobbyStories(recommendations, ownedStories);
    const storyIds = merged.map((item) => item.story.id);
    if (!storyIds.length) return merged;
    const { data: translationRows, error: translationError } = await supabase
      .from("story_translations")
      .select("story_id,target_language,title,excerpt,body,themes,mood,life_stage,people,city,updated_at")
      .in("story_id", storyIds);
    if (translationError) {
      console.info("[StoryVerse] Cached story translations could not be loaded.", translationError);
      return merged;
    }
    const translations = new Map<string, Partial<Record<Language, StoryTranslation>>>();
    for (const row of translationRows ?? []) {
      const targetLanguage = String(row.target_language);
      if (targetLanguage !== "zh" && targetLanguage !== "en") continue;
      const storyId = String(row.story_id);
      translations.set(storyId, {
        ...translations.get(storyId),
        [targetLanguage]: storyTranslationFromRow(row),
      });
    }
    return merged.map((item) => ({
      ...item,
      story: { ...item.story, translations: translations.get(item.story.id) },
    }));
  },

  setReaction: (storyId: string, value: StoryReaction) => invoke("reactions", { storyId, value }),
  clearReaction: (storyId: string) => invoke("reactions", { storyId, value: null }),
  listReactions: async () => {
    const { user } = await dataService.getCurrentUser();
    const { data, error } = await supabase.from("reactions").select("story_id,value").eq("user_id", user.id);
    if (error) throw new DataServiceError(error.message, "REACTIONS_UNAVAILABLE");
    return Object.fromEntries((data ?? []).map((row) => [row.story_id, row.value])) as Record<string, StoryReaction>;
  },
  createReport: (storyId: string, reason: string, note: string) => invoke("reports", { storyId, reason, note }),

  translateStories: async (storyIds: string[], targetLanguage: Language) => {
    if (!storyIds.length) return {} as Record<string, StoryTranslation>;
    const { translations } = await invoke<{ translations: Record<string, StoryTranslation> }>("story-translate", {
      storyIds,
      targetLanguage,
    });
    return translations;
  },

  listNotifications: async () => {
    const { notifications } = await invoke<{ notifications: Record<string, unknown>[] }>(
      "notifications",
      undefined,
      "GET",
    );
    return notifications.map(notificationFromRow);
  },

  markNotificationsRead: (ids?: string[]) => invoke("notifications", ids ? { ids } : { all: true }),

  createStoryImage: (storyId: string, style: string) =>
    invoke<StoryImageGeneration>("story-generate-image", { storyId, style }),

  getStoryImageGeneration: async (storyId: string): Promise<StoryImageGeneration> => {
    const { data, error } = await supabase
      .from("generated_images")
      .select("public_url,style,status,highlight,prompt,error")
      .eq("story_id", storyId)
      .maybeSingle();
    if (error) throw new DataServiceError(error.message, "STORY_IMAGE_UNAVAILABLE");
    if (!data) return { status: "queued" };
    const status = String(data.status);
    if (status === "generating" || status === "queued") return { status };
    if (status === "failed") return { status: "failed", error: String(data.error ?? "") };
    if (!data.public_url || !String(data.prompt ?? "").startsWith("STORYVERSE_IMAGE_PROMPT_V2")) {
      return { status: "failed", error: "The selected image is no longer compatible with this story." };
    }
    return {
      status: "ready",
      imageUrl: String(data.public_url),
      imageStyle: String(data.style),
      highlight: data.highlight as {
        title: string;
        moment: string;
        scene: string;
        action: string;
        emotion: string;
      },
      imagePrompt: String(data.prompt),
      reused: true,
    };
  },

  getStoryImage: async (storyId: string) => {
    const image = await dataService.getStoryImageGeneration(storyId);
    return image.status === "ready" ? image : null;
  },

  getAdminDashboard: () => invoke<AdminDashboard>("admin-api", { action: "dashboard" }),
  adminAction: <T = { updated: boolean }>(action: string, input: Record<string, unknown>) =>
    invoke<T>("admin-api", { action, ...input }),
};

export type AdminDashboard = {
  reviews: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  stories: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  feedback: Array<Record<string, unknown>>;
  types: Array<Record<string, unknown>>;
  configs: Array<Record<string, unknown>>;
  imports: Array<Record<string, unknown>>;
  failures: Array<Record<string, unknown>>;
  analytics: Record<string, unknown>;
};
