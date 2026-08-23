import { sha256 } from "./crypto.ts";
import { STORY_IMAGE_PROMPT_MARKER } from "./image-prompt.ts";
import type { StoryDraftInput } from "./validation.ts";

export async function storyContentHash(title: string, body: string) {
  return sha256(`${title.trim()}\u0000${body.trim()}`);
}

export function draftDatabaseFields(draft: ReturnType<typeof normalizeDraftShape>) {
  return {
    guide: draft.guide,
    custom_guide: draft.customGuide,
    title: draft.title,
    body: draft.body,
    mood: draft.mood,
    life_stage: draft.stage,
    age: draft.age,
    gender: draft.gender,
    city: draft.city,
    city_name_en: draft.cityNameEn,
    city_country: draft.cityCountry,
    latitude: draft.cityLat,
    longitude: draft.cityLon,
    people: draft.people,
    edits: draft.edits,
    pasted_chars: draft.pastedChars,
    saves: draft.saves,
  };
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDraftShape(draft: StoryDraftInput & Record<string, unknown>) {
  return {
    ...draft,
    guide: String(draft.guide ?? ""),
    customGuide: String(draft.customGuide ?? ""),
    title: String(draft.title ?? ""),
    body: String(draft.body ?? ""),
    mood: String(draft.mood ?? ""),
    stage: String(draft.stage ?? ""),
    age: nullableNumber(draft.age),
    gender: String(draft.gender ?? ""),
    city: String(draft.city ?? ""),
    cityNameEn: String(draft.cityNameEn ?? ""),
    cityCountry: String(draft.cityCountry ?? ""),
    cityLat: nullableNumber(draft.cityLat),
    cityLon: nullableNumber(draft.cityLon),
    people: Array.isArray(draft.people) ? draft.people.map(String) : [],
    edits: Number(draft.edits ?? 0),
    pastedChars: Number(draft.pastedChars ?? 0),
    saves: Number(draft.saves ?? 0),
  };
}

export function draftFromDatabase(row: Record<string, unknown>) {
  return {
    id: row.id,
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
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
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

export function storyPayload(row: Record<string, unknown>) {
  const body = String(row.body ?? "");
  const themes = Array.isArray(row.final_themes) ? row.final_themes.map(String) : [];
  const type = row.story_type as Record<string, unknown> | null | undefined;
  const images = Array.isArray(row.generated_images)
    ? (row.generated_images as Array<Record<string, unknown>>).filter(
        (image) => image.status === "ready" && String(image.prompt ?? "").startsWith(STORY_IMAGE_PROMPT_MARKER),
      )
    : [];
  images.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return {
    id: String(row.id),
    title: String(row.title || row.ai_suggested_title || "我的故事"),
    excerpt: String(row.excerpt || body.slice(0, 70)),
    body,
    author: String(row.author_display_name || "StoryVerse"),
    city: String(row.city ?? ""),
    cityNameEn: String(row.city_name_en ?? ""),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
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
    typeColor: type?.color ? String(type.color) : undefined,
    typeLabelZh: type?.label_zh ? String(type.label_zh) : undefined,
    typeLabelEn: type?.label_en ? String(type.label_en) : undefined,
    themes,
    status: String(row.status ?? "published"),
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
    imageUrl: images[0]?.public_url ? String(images[0].public_url) : row.image_url ? String(row.image_url) : undefined,
    x: 50,
    y: 50,
  };
}
