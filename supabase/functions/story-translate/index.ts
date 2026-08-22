import {
  arkModelInfo,
  translateStoriesWithArk,
  type StoryTranslationInput,
  type StoryTranslationLanguage,
} from "../_shared/ark.ts";
import { sha256 } from "../_shared/crypto.ts";
import { ApiError, json, readJson, serve } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

const PROMPT_VERSIONS: Record<StoryTranslationLanguage, string> = {
  en: "storyverse-story-translation-v1",
  zh: "storyverse-story-translation-v2",
};

type StoryRow = Record<string, unknown> & { id: string };

function sourceFromRow(row: StoryRow): StoryTranslationInput {
  const body = String(row.body ?? "");
  return {
    id: String(row.id),
    title: String(row.title || row.ai_suggested_title || "My story"),
    excerpt: String(row.excerpt || body.slice(0, 70)),
    body,
    themes: Array.isArray(row.final_themes) ? row.final_themes.map(String) : [],
    mood: String(row.mood ?? ""),
    lifeStage: String(row.life_stage ?? ""),
    people: Array.isArray(row.people) ? row.people.map(String) : [],
    city: String(row.city ?? ""),
  };
}

async function sourceHash(source: StoryTranslationInput) {
  return sha256(JSON.stringify(source));
}

serve(async (request) => {
  if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "不支持这个请求方式。");
  const { client } = await requireUser(request);
  const input = await readJson<{ storyIds?: unknown; targetLanguage?: unknown }>(request);
  if (input.targetLanguage !== "en" && input.targetLanguage !== "zh") {
    throw new ApiError(400, "INVALID_TARGET_LANGUAGE", "目标语言必须是中文或英文。");
  }
  const targetLanguage = input.targetLanguage as StoryTranslationLanguage;
  const promptVersion = PROMPT_VERSIONS[targetLanguage];
  const storyIds = Array.isArray(input.storyIds)
    ? [
        ...new Set(
          input.storyIds
            .map(String)
            .map((id) => id.trim())
            .filter(Boolean),
        ),
      ]
    : [];
  if (storyIds.length < 1 || storyIds.length > 5) {
    throw new ApiError(400, "INVALID_STORY_IDS", "每次需要提交 1–5 篇故事。");
  }

  const { data: visibleRows, error: storyError } = await client
    .from("stories")
    .select("id,title,ai_suggested_title,excerpt,body,final_themes,mood,life_stage,people,city,city_name_en")
    .in("id", storyIds);
  if (storyError) throw storyError;
  if ((visibleRows ?? []).length !== storyIds.length) {
    throw new ApiError(404, "STORY_NOT_FOUND", "有故事不存在，或你无权查看。");
  }

  const sources = (visibleRows as StoryRow[]).map(sourceFromRow);
  const hashes = new Map(
    await Promise.all(sources.map(async (source) => [source.id, await sourceHash(source)] as const)),
  );
  const admin = adminClient();
  const model = arkModelInfo().text;
  const { data: cachedRows, error: cacheError } = await admin
    .from("story_translations")
    .select("*")
    .in("story_id", storyIds)
    .eq("target_language", targetLanguage);
  if (cacheError) throw cacheError;
  const cached = new Map((cachedRows ?? []).map((row) => [String(row.story_id), row]));
  const missing = sources.filter((source) => {
    const row = cached.get(source.id);
    return (
      !row || row.source_hash !== hashes.get(source.id) || row.model !== model || row.prompt_version !== promptVersion
    );
  });

  if (missing.length) {
    const translated = await translateStoriesWithArk(missing, targetLanguage);
    const { error: saveError } = await admin.from("story_translations").upsert(
      translated.map((story) => ({
        story_id: story.id,
        target_language: targetLanguage,
        source_hash: hashes.get(story.id),
        title: story.title,
        excerpt: story.excerpt,
        body: story.body,
        themes: story.themes,
        mood: story.mood,
        life_stage: story.lifeStage,
        people: story.people,
        city: story.city,
        model,
        prompt_version: promptVersion,
      })),
      { onConflict: "story_id,target_language" },
    );
    if (saveError) throw saveError;
  }

  const { data: translations, error: resultError } = await admin
    .from("story_translations")
    .select("story_id,title,excerpt,body,themes,mood,life_stage,people,city,updated_at")
    .in("story_id", storyIds)
    .eq("target_language", targetLanguage);
  if (resultError) throw resultError;
  const cityNames = new Map((visibleRows ?? []).map((row) => [String(row.id), String(row.city_name_en ?? "")]));
  return json(request, {
    targetLanguage,
    translations: Object.fromEntries(
      (translations ?? []).map((row) => [
        row.story_id,
        {
          title: row.title,
          excerpt: row.excerpt,
          body: row.body,
          themes: row.themes,
          emotion: row.mood,
          stage: row.life_stage,
          people: row.people,
          city: targetLanguage === "en" ? cityNames.get(String(row.story_id)) || row.city || undefined : row.city,
          translatedAt: row.updated_at,
        },
      ]),
    ),
  });
});
