import { createHash, randomInt, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { requiredFrontendOrigin } from "./lib/frontend-origin.mjs";

const PROJECT_REF = "zgyrbtdyraxglxhbkazp";
const CONFIRMATION = `prepare-seed-media-${PROJECT_REF}`;
const ONLINE_URL = `https://${PROJECT_REF}.supabase.co`;
const OPERATOR_USERNAME = "seed_import_operator";
const OPERATOR_EMAIL = "seed-import-operator@system.storyverse.invalid";
const IMAGE_STYLES = ["clay-3d", "indie-zine", "retro-collage"];
const TRANSLATION_PROMPT_VERSION = "storyverse-story-translation-v1";
const frontendOrigin = requiredFrontendOrigin();

function parseEnvFile(value) {
  return Object.fromEntries(
    value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1).trim();
        return [key, rawValue.replace(/^(['"])(.*)\1$/, "$2")];
      }),
  );
}

function parseJsonOutput(output, commandName) {
  const starts = [output.indexOf("{"), output.indexOf("[")].filter((index) => index >= 0);
  if (!starts.length) throw new Error(`${commandName} did not return JSON.`);
  return JSON.parse(output.slice(Math.min(...starts)));
}

function projectKeys() {
  const result = spawnSync(
    "npx",
    ["supabase", "projects", "api-keys", "--project-ref", PROJECT_REF, "--reveal", "--output", "json"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || "Could not read Supabase API keys.");
  const payload = parseJsonOutput(result.stdout, "supabase projects api-keys");
  const keys = Array.isArray(payload) ? payload : (payload.api_keys ?? payload.keys ?? []);
  const secret = keys.find((key) => key.type === "secret") ?? keys.find((key) => key.name === "service_role");
  const publishable =
    keys.find((key) => key.type === "publishable") ?? keys.find((key) => key.name === "anon" || key.id === "anon");
  const secretKey = String(secret?.api_key ?? secret?.key ?? "");
  const publishableKey = String(publishable?.api_key ?? publishable?.key ?? "");
  if (!secretKey || !publishableKey) throw new Error("Could not resolve Supabase API keys.");
  return { secretKey, publishableKey };
}

function shuffledStyles(count) {
  const values = Array.from({ length: count }, (_, index) => IMAGE_STYLES[index % IMAGE_STYLES.length]);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function imageDimensions(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const chunk = bytes.toString("ascii", 12, 16);
    if (chunk === "VP8X") {
      return {
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
      };
    }
    if (chunk === "VP8 ") {
      return {
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && bytes[20] === 0x2f) {
      return {
        width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
        height: 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
      };
    }
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isStartOfFrame) {
        return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const segmentLength = bytes.readUInt16BE(offset + 2);
      if (segmentLength < 2) break;
      offset += 2 + segmentLength;
    }
  }
  throw new Error("Could not parse generated image dimensions.");
}

async function verifySquareImages(images) {
  const dimensions = [];
  for (let offset = 0; offset < images.length; offset += 5) {
    const batch = images.slice(offset, offset + 5);
    const batchDimensions = await Promise.all(
      batch.map(async (image) => {
        const response = await fetch(image.public_url, { headers: { Range: "bytes=0-524287" } });
        if (!response.ok) throw new Error(`Could not read generated image (${response.status}).`);
        const bytes = Buffer.from(await response.arrayBuffer());
        try {
          return imageDimensions(bytes);
        } catch (error) {
          throw new Error(
            `Could not parse ${image.story_id} (${response.headers.get("content-type") ?? "unknown"}, ${bytes.subarray(0, 24).toString("hex")}).`,
            { cause: error },
          );
        }
      }),
    );
    dimensions.push(...batchDimensions);
  }
  const nonSquare = dimensions.filter(({ width, height }) => width !== height);
  if (nonSquare.length) throw new Error(`Found ${nonSquare.length} non-square generated images.`);
  return dimensions;
}

function translationSource(story) {
  const body = String(story.body ?? "");
  return {
    id: String(story.id),
    title: String(story.title || story.ai_suggested_title || "My story"),
    excerpt: String(story.excerpt || body.slice(0, 70)),
    body,
    themes: Array.isArray(story.final_themes) ? story.final_themes.map(String) : [],
    mood: String(story.mood ?? ""),
    lifeStage: String(story.life_stage ?? ""),
    people: Array.isArray(story.people) ? story.people.map(String) : [],
    city: String(story.city ?? ""),
  };
}

function sourceHash(source) {
  return createHash("sha256").update(JSON.stringify(source)).digest("hex");
}

function responseText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  throw new Error("Ark translation response did not contain text.");
}

function parseTranslationJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

function validateTranslation(row, source, preserveEnglishBody) {
  const themes = Array.isArray(row?.themes) ? row.themes.map((value) => String(value).trim()) : [];
  const people = Array.isArray(row?.people) ? row.people.map((value) => String(value).trim()) : [];
  const translated = {
    title: String(row?.title ?? "").trim(),
    excerpt: String(row?.excerpt ?? "").trim(),
    body: preserveEnglishBody ? source.body : String(row?.body ?? "").trim(),
    themes,
    mood: String(row?.mood ?? "").trim(),
    lifeStage: String(row?.lifeStage ?? "").trim(),
    people,
    city: String(row?.city ?? "").trim(),
  };
  if (
    !translated.title ||
    !translated.excerpt ||
    !translated.body ||
    themes.length !== source.themes.length ||
    people.length !== source.people.length ||
    themes.some((value) => !value) ||
    people.some((value) => !value)
  ) {
    throw new Error("Ark returned an incomplete story translation.");
  }
  return translated;
}

async function translateWithArk(source, arkConfig) {
  const cjkCharacters = (source.body.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinWords = (source.body.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []).length;
  const preserveEnglishBody = latinWords >= 20 && cjkCharacters < 20;
  const modelSource = preserveEnglishBody ? { ...source, body: "__PRESERVE_ORIGINAL_ENGLISH_BODY__" } : source;
  const prompt = `You are StoryVerse's literary translator. Translate every Chinese user-authored field into natural,
faithful English while preserving the author's voice, facts, emotional intensity, paragraph breaks, and ambiguity.
Do not summarize, censor, explain, add details, or translate the id. Text already written in English must remain
unchanged. Translate short metadata as concise display labels. Return strict JSON without Markdown.

Return exactly this shape:
{"story":{"id":"","title":"","excerpt":"","body":"","themes":[],"mood":"","lifeStage":"","people":[],"city":""}}

Preserve the number and order of themes and people. If body is the marker
__PRESERVE_ORIGINAL_ENGLISH_BODY__, return that exact marker as body; it will be restored locally.
Source data follows:
${JSON.stringify(modelSource)}`;
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 240_000);
    try {
      const response = await fetch(`${arkConfig.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${arkConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: arkConfig.model,
          messages: [
            {
              role: "user",
              content:
                attempt === 0
                  ? prompt
                  : `${prompt}\nYour previous response was invalid. Return one complete JSON object only.`,
            },
          ],
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`Ark returned HTTP ${response.status}.`);
      const parsed = parseTranslationJson(responseText(payload));
      if (String(parsed?.story?.id ?? "") !== source.id) throw new Error("Ark returned a mismatched story id.");
      return validateTranslation(parsed.story, source, preserveEnglishBody);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Ark translation failed.");
}

const linkedProjectRef = (await readFile("supabase/.temp/project-ref", "utf8")).trim();
if (linkedProjectRef !== PROJECT_REF) {
  throw new Error(`Refusing media generation: linked project is ${linkedProjectRef || "missing"}.`);
}
const { secretKey, publishableKey } = projectKeys();
const arkEnv = parseEnvFile(await readFile("supabase/functions/.env.local", "utf8"));
const arkConfig = {
  apiKey: String(arkEnv.ARK_API_KEY ?? ""),
  model: String(arkEnv.ARK_TEXT_MODEL ?? ""),
  baseUrl: String(arkEnv.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3").replace(/\/$/, ""),
};
if (!arkConfig.apiKey || !arkConfig.model) throw new Error("ARK_API_KEY and ARK_TEXT_MODEL are required.");
const service = createClient(ONLINE_URL, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
const publicClient = createClient(ONLINE_URL, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { data: stories, error: storyError } = await service
  .from("stories")
  .select(
    "id,external_id,title,ai_suggested_title,excerpt,body,final_themes,mood,life_stage,people,city,city_name_en,status,visual_status",
  )
  .eq("source_kind", "seed")
  .order("external_id");
if (storyError) throw storyError;
if (stories.length !== 20 || stories.some((story) => story.status !== "published")) {
  throw new Error(`Expected 20 published seed stories, found ${stories.length}.`);
}
const storyIds = stories.map((story) => story.id);
const [translationLookup, imageLookup] = await Promise.all([
  service
    .from("story_translations")
    .select("story_id,source_hash,model,prompt_version")
    .in("story_id", storyIds)
    .eq("target_language", "en"),
  service.from("generated_images").select("story_id,status,style,public_url,error").in("story_id", storyIds),
]);
if (translationLookup.error || imageLookup.error) throw translationLookup.error ?? imageLookup.error;
const translations = translationLookup.data;
const images = imageLookup.data;
console.log(
  JSON.stringify({
    projectRef: PROJECT_REF,
    mode: process.env.STORYVERSE_PREPARE_SEED_MEDIA === CONFIRMATION ? "prepare" : "preflight",
    stories: stories.length,
    cachedTranslations: translations?.length ?? 0,
    readyImages: (images ?? []).filter((image) => image.status === "ready" && image.public_url).length,
    failedImages: (images ?? [])
      .filter((image) => image.status === "failed")
      .map((image) => ({ storyId: image.story_id, error: image.error })),
  }),
);
if (process.env.STORYVERSE_PREPARE_SEED_MEDIA !== CONFIRMATION) {
  console.log(`Set STORYVERSE_PREPARE_SEED_MEDIA=${CONFIRMATION} to generate missing media.`);
  process.exit(0);
}

async function ensureOperator() {
  const password = `Online-${randomUUID()}-Aa9!`;
  const { data: existing, error: lookupError } = await service
    .from("profiles")
    .select("id")
    .eq("username", OPERATOR_USERNAME)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!existing?.id) throw new Error("Seed import operator is missing.");
  const { error: passwordError } = await service.auth.admin.updateUserById(existing.id, { password });
  if (passwordError) throw passwordError;
  const { error: activationError } = await service
    .from("profiles")
    .update({ role: "admin", status: "active" })
    .eq("id", existing.id);
  if (activationError) throw activationError;
  const { data: login, error: loginError } = await publicClient.auth.signInWithPassword({
    email: OPERATOR_EMAIL,
    password,
  });
  if (loginError || !login.session) throw loginError ?? new Error("Could not sign in media operator.");
  return { userId: existing.id, accessToken: login.session.access_token };
}

async function callFunction(name, accessToken, body) {
  const response = await fetch(`${ONLINE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: frontendOrigin,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${name} returned ${response.status}: ${payload.error ?? "Unknown error"}`);
  return payload;
}

let operator;
try {
  const cachedTranslations = new Map((translations ?? []).map((row) => [row.story_id, row]));
  const missingTranslations = stories
    .map((story) => ({ story, source: translationSource(story) }))
    .filter(({ story, source }) => {
      const cached = cachedTranslations.get(story.id);
      return (
        !cached ||
        cached.source_hash !== sourceHash(source) ||
        cached.model !== arkConfig.model ||
        cached.prompt_version !== TRANSLATION_PROMPT_VERSION
      );
    });
  for (let index = 0; index < missingTranslations.length; index += 1) {
    const { story, source } = missingTranslations[index];
    const translated = await translateWithArk(source, arkConfig);
    const { error: saveError } = await service.from("story_translations").upsert(
      {
        story_id: story.id,
        target_language: "en",
        source_hash: sourceHash(source),
        title: translated.title,
        excerpt: translated.excerpt,
        body: translated.body,
        themes: translated.themes,
        mood: translated.mood,
        life_stage: translated.lifeStage,
        people: translated.people,
        city: translated.city || story.city_name_en || source.city,
        model: arkConfig.model,
        prompt_version: TRANSLATION_PROMPT_VERSION,
      },
      { onConflict: "story_id,target_language" },
    );
    if (saveError) throw saveError;
    console.log(`[translation ${index + 1}/${missingTranslations.length}] ${story.external_id}`);
  }

  operator = await ensureOperator();
  const readyStoryIds = new Set(
    (images ?? []).filter((image) => image.status === "ready" && image.public_url).map((image) => image.story_id),
  );
  const missingImages = stories.filter((story) => !readyStoryIds.has(story.id));
  const styles = shuffledStyles(missingImages.length);
  for (let index = 0; index < missingImages.length; index += 1) {
    const story = missingImages[index];
    const style = styles[index];
    let lastError;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await callFunction("admin-api", operator.accessToken, {
          action: "seed-generate-image",
          storyId: story.id,
          style,
        });
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        console.log(`[image retry] ${story.external_id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (lastError) throw lastError;
    console.log(`[image ${index + 1}/${missingImages.length}] ${story.external_id} · ${style}`);
  }

  const [{ data: finalTranslations, error: translationError }, { data: finalImages, error: imageError }] =
    await Promise.all([
      service.from("story_translations").select("story_id").in("story_id", storyIds).eq("target_language", "en"),
      service
        .from("generated_images")
        .select("story_id,status,style,public_url,storage_path,prompt")
        .in("story_id", storyIds),
    ]);
  if (translationError || imageError) throw translationError ?? imageError;
  const readyImages = finalImages.filter(
    (image) =>
      image.status === "ready" &&
      image.public_url &&
      image.storage_path &&
      String(image.prompt).startsWith("STORYVERSE_IMAGE_PROMPT_V2"),
  );
  const styleCounts = Object.fromEntries(
    Object.entries(Object.groupBy(readyImages, (image) => image.style)).map(([style, rows]) => [style, rows.length]),
  );
  const dimensions = await verifySquareImages(readyImages);
  const validation = {
    translations: finalTranslations.length,
    imageRows: finalImages.length,
    readyImages: readyImages.length,
    uniqueImageStories: new Set(finalImages.map((image) => image.story_id)).size,
    squareImages: dimensions.length,
    imageDimensions: [...new Set(dimensions.map(({ width, height }) => `${width}x${height}`))],
    styleCounts,
  };
  if (
    validation.translations !== 20 ||
    validation.imageRows !== 20 ||
    validation.readyImages !== 20 ||
    validation.uniqueImageStories !== 20 ||
    validation.squareImages !== 20
  ) {
    throw new Error(`Cold-start media validation failed: ${JSON.stringify(validation)}`);
  }
  console.log(JSON.stringify(validation));
} finally {
  if (operator) {
    await service.from("profiles").update({ role: "user", status: "suspended" }).eq("id", operator.userId);
  }
}
