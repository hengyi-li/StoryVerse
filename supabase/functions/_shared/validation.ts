import { ApiError } from "./http.ts";
import { isStoryTypeId } from "./story-types.ts";
import { storyBodyLengthUnits } from "./story-length.ts";

export const ACCOUNT_PATTERN = /^[A-Za-z0-9_]{4,20}$/;
export const LIFE_STAGES = ["学龄期", "青春期", "成年早期", "成年中期", "老年期"] as const;
export const GENDERS = ["男", "女", "其他"] as const;
export const SECURITY_QUESTIONS = ["first_school", "childhood_place", "first_pet"] as const;
export const STORY_BODY_MIN_LENGTH = 100;
export const STORY_BODY_MAX_LENGTH = 1500;
export const SEED_STORY_BODY_MAX_LENGTH = 8000;
export const STORY_BODY_MAX_RAW_LENGTH = 20000;

export type StoryDraftInput = {
  id?: string;
  guide: string;
  customGuide: string;
  title: string;
  body: string;
  mood: string;
  stage: string;
  age: string | number;
  gender: string;
  city: string;
  cityNameEn?: string;
  cityCountry?: string;
  cityLat?: number | null;
  cityLon?: number | null;
  people: string[];
  startedAt?: number;
  edits?: number;
  pastedChars?: number;
  saves?: number;
  version?: number;
};

export function normalizeUsername(value: unknown) {
  const username = String(value ?? "")
    .trim()
    .toLowerCase();
  if (!ACCOUNT_PATTERN.test(username)) {
    throw new ApiError(400, "INVALID_USERNAME", "账号需要使用 4–20 位字母、数字或下划线。");
  }
  return username;
}

export function validatePassword(value: unknown) {
  const password = String(value ?? "");
  if (password.length < 10 || password.length > 72) {
    throw new ApiError(400, "INVALID_PASSWORD", "密码长度需要在 10–72 位之间。");
  }
  return password;
}

export function validatePasswordConfirmation(password: string, confirmation: unknown) {
  if (password !== String(confirmation ?? "")) {
    throw new ApiError(400, "PASSWORD_MISMATCH", "两次输入的密码不一致。");
  }
  return password;
}

export function validateSecurityQuestion(value: unknown) {
  const question = String(value ?? "").trim();
  if (!SECURITY_QUESTIONS.includes(question as (typeof SECURITY_QUESTIONS)[number])) {
    throw new ApiError(400, "INVALID_SECURITY_QUESTION", "请选择一个有效的找回密码问题。");
  }
  return question;
}

export function validateSecurityAnswer(value: unknown) {
  const answer = String(value ?? "").trim();
  if (answer.length < 2 || answer.length > 80) {
    throw new ApiError(400, "INVALID_SECURITY_ANSWER", "找回密码答案需要在 2–80 字之间。");
  }
  return answer;
}

export function validateDraft(
  value: StoryDraftInput,
  allowIncomplete = false,
  options: { maxBodyLength?: number } = {},
) {
  if (!value || typeof value !== "object") throw new ApiError(400, "INVALID_STORY", "故事内容不完整。");
  const body = String(value.body ?? "").trim();
  const bodyLength = storyBodyLengthUnits(body);
  const maxBodyLength = options.maxBodyLength ?? STORY_BODY_MAX_LENGTH;
  const rawAge = String(value.age ?? "").trim();
  const age = rawAge ? Number(rawAge) : Number.NaN;
  const people = Array.isArray(value.people)
    ? value.people
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const rawLatitude = value.cityLat;
  const rawLongitude = value.cityLon;
  const hasLatitude = rawLatitude !== null && rawLatitude !== undefined && String(rawLatitude).trim() !== "";
  const hasLongitude = rawLongitude !== null && rawLongitude !== undefined && String(rawLongitude).trim() !== "";
  const latitude = hasLatitude ? Number(rawLatitude) : null;
  const longitude = hasLongitude ? Number(rawLongitude) : null;
  if (
    hasLatitude !== hasLongitude ||
    (hasLatitude && (!Number.isFinite(latitude) || Number(latitude) < -90 || Number(latitude) > 90)) ||
    (hasLongitude && (!Number.isFinite(longitude) || Number(longitude) < -180 || Number(longitude) > 180))
  ) {
    throw new ApiError(400, "INVALID_COORDINATES", "城市坐标超出有效范围。");
  }
  if (!allowIncomplete) {
    if (bodyLength < STORY_BODY_MIN_LENGTH || bodyLength > maxBodyLength || body.length > STORY_BODY_MAX_RAW_LENGTH) {
      throw new ApiError(
        400,
        "INVALID_STORY_LENGTH",
        `故事正文需要在 ${STORY_BODY_MIN_LENGTH}–${maxBodyLength} 字 / 词之间。`,
      );
    }
    if (!String(value.mood ?? "").trim()) throw new ApiError(400, "MOOD_REQUIRED", "请选择回想这段故事时的主要感受。");
    if (!LIFE_STAGES.includes(String(value.stage ?? "") as (typeof LIFE_STAGES)[number])) {
      throw new ApiError(400, "LIFE_STAGE_REQUIRED", "请选择当时所处的人生阶段。");
    }
    if (!Number.isInteger(age) || age < 1 || age > 120) throw new ApiError(400, "AGE_REQUIRED", "请填写有效年龄。");
    if (!GENDERS.includes(String(value.gender ?? "").trim() as (typeof GENDERS)[number])) {
      throw new ApiError(400, "GENDER_REQUIRED", "请选择有效的性别选项。");
    }
    if (!String(value.city ?? "").trim()) throw new ApiError(400, "CITY_REQUIRED", "请填写城市。");
    if (!hasLatitude || !hasLongitude) {
      throw new ApiError(400, "CITY_COORDINATES_REQUIRED", "请从搜索结果中选择城市，确认地点坐标。");
    }
    if (!people.length) throw new ApiError(400, "PEOPLE_REQUIRED", "请选择故事中的人物。");
  }
  return {
    ...value,
    title: String(value.title ?? "")
      .trim()
      .slice(0, 120),
    body,
    mood: String(value.mood ?? "").trim(),
    stage: String(value.stage ?? "").trim(),
    age: Number.isInteger(age) ? age : null,
    gender: String(value.gender ?? "").trim(),
    city: String(value.city ?? "").trim(),
    cityNameEn: String(value.cityNameEn ?? "").trim(),
    cityCountry: String(value.cityCountry ?? "").trim(),
    cityLat: latitude,
    cityLon: longitude,
    people,
  };
}

export function validateFinalLabels(typeId: unknown, themes: unknown) {
  if (!isStoryTypeId(typeId)) throw new ApiError(400, "INVALID_STORY_TYPE", "请选择一个有效的故事类型。");
  const normalizedThemes = Array.isArray(themes)
    ? themes
        .map(String)
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const uniqueThemes = [...new Set(normalizedThemes)];
  if (uniqueThemes.length !== 2) throw new ApiError(400, "INVALID_THEMES", "请确认两个不重复的主题。");
  for (const theme of uniqueThemes) {
    const isChinese = /[\u3400-\u9fff]/.test(theme);
    const characterLength = Array.from(theme).length;
    const wordLength = theme.split(/\s+/).length;
    if (
      (isChinese && (characterLength < 2 || characterLength > 6)) ||
      (!isChinese && (wordLength < 1 || wordLength > 3))
    ) {
      throw new ApiError(400, "INVALID_THEME_LENGTH", "中文主题需要 2–6 字，英文主题最多 3 个词。");
    }
  }
  return { typeId, themes: uniqueThemes as [string, string] };
}
