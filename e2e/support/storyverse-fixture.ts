import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.E2E_SUPABASE_URL || "";
const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY || "";
const secretKey = process.env.E2E_SUPABASE_SECRET_KEY || "";

if (!supabaseUrl.startsWith("http://127.0.0.1:") || !publishableKey || !secretKey) {
  throw new Error("E2E refuses to run without an isolated local Supabase configuration.");
}

export const service = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export type TestAccount = {
  id: string;
  username: string;
  password: string;
  displayName: string;
  accessToken: string;
};

export function uniqueAccount(prefix = "e2e") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`.slice(0, 20);
}

async function invoke(name: string, body: unknown, accessToken = publishableKey, method = "POST") {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
        method,
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
          Origin: "http://127.0.0.1:4173",
          "Content-Type": "application/json",
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      lastError = new Error(`${name} returned ${response.status}: ${payload.code || payload.error || "unknown"}`);
      if (![502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === 3) throw lastError;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 300));
  }
  throw lastError ?? new Error(`${name} failed`);
}

export async function createAccount(
  options: {
    username?: string;
    displayName?: string;
    pretestRequired?: boolean;
    role?: "user" | "admin";
  } = {},
): Promise<TestAccount> {
  const username = options.username || uniqueAccount();
  const password = "StoryVerse-E2E-2026!";
  const displayName = options.displayName || "E2E 星旅人";
  const payload = await invoke("auth-signup", {
    accountIdentifier: username,
    displayName,
    password,
    passwordConfirmation: password,
    securityQuestion: "first_school",
    securityAnswer: "测试学校",
  });
  if (options.pretestRequired === false || options.role === "admin") {
    const { error } = await service
      .from("profiles")
      .update({
        ...(options.pretestRequired === false ? { pretest_required: false } : {}),
        ...(options.role ? { role: options.role } : {}),
      })
      .eq("id", payload.user.id);
    if (error) throw error;
  }
  return {
    id: payload.user.id,
    username,
    password,
    displayName,
    accessToken: payload.session.access_token,
  };
}

export async function cleanupAccounts(accounts: Array<TestAccount | string>) {
  for (const account of accounts) {
    const id = typeof account === "string" ? account : account.id;
    await service.auth.admin.deleteUser(id).catch(() => undefined);
  }
}

export async function cleanupAccountByUsername(username: string) {
  const { data } = await service.from("profiles").select("id").eq("username", username).maybeSingle();
  if (data?.id) await cleanupAccounts([String(data.id)]);
}

export async function finishBrowserActivity(page: Page) {
  if (!page.isClosed()) await page.close({ runBeforeUnload: true }).catch(() => undefined);
  // pagehide uses keepalive for the final analytics batch. Let that request
  // finish before deleting the temporary profile referenced by the event.
  await new Promise((resolve) => setTimeout(resolve, 400));
}

export const completePretestAnswers = {
  consented: true,
  birthYear: 1995,
  gender: "male",
  residenceRegion: "overseas",
  countryRegion: "Singapore",
  province: "",
  city: "",
  communityType: "",
  ethnicity: "not_chinese_citizen",
  education: "bachelor",
  educationOther: "",
  employment: "unemployed",
  industryPrimary: "",
  industrySecondary: "",
  discipline: "",
  major: "",
};

export async function completePretest(account: TestAccount) {
  for (const step of [1, 2, 3] as const) {
    await invoke("pretest", { action: "save", step, answers: completePretestAnswers }, account.accessToken);
  }
  await invoke("pretest", { action: "submit", step: 4, answers: completePretestAnswers }, account.accessToken);
}

function storyRow(userId: string, displayName: string, suffix: string, sourceKind: "user" | "seed") {
  const body =
    "周末我来到社区花园，和几位第一次见面的邻居一起整理旧书和花盆。开始时大家有些拘谨，后来在一次次递工具和确认摆放位置的过程中逐渐熟悉起来。傍晚离开时，原本凌乱的角落已经变得整洁。这段普通经历让我意识到，耐心合作与真诚交流可以让陌生人共同完成一件有意义的事情。";
  return {
    user_id: userId,
    author_display_name: displayName,
    title: sourceKind === "seed" ? "花园里的陌生伙伴" : "我的社区花园傍晚",
    body,
    excerpt: body,
    mood: "平和自足",
    life_stage: "成年早期",
    age: sourceKind === "seed" ? 35 : 29,
    gender: sourceKind === "seed" ? "女" : "男",
    city: sourceKind === "seed" ? "北京" : "上海",
    city_name_en: sourceKind === "seed" ? "Beijing" : "Shanghai",
    city_country: "China",
    latitude: sourceKind === "seed" ? 39.9042 : 31.2304,
    longitude: sourceKind === "seed" ? 116.4074 : 121.4737,
    people: ["自己", "陌生人"],
    status: "published",
    moderation_decision: "pass",
    final_type_id: "other_relationship",
    final_themes: ["社区协作", "陌生善意"],
    source_kind: sourceKind,
    external_id: sourceKind === "seed" ? `e2e-seed-${suffix}` : null,
    content_hash: `e2e-${sourceKind}-${suffix}`,
    published_at: new Date().toISOString(),
  };
}

export async function seedLobby(account: TestAccount) {
  const seedAuthor = await createAccount({ displayName: "E2E 故事作者", pretestRequired: false });
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await service
    .from("stories")
    .insert([
      storyRow(account.id, account.displayName, `${suffix}-own`, "user"),
      storyRow(seedAuthor.id, seedAuthor.displayName, `${suffix}-seed`, "seed"),
    ])
    .select("id,user_id,source_kind,title");
  if (error) throw error;
  const { error: translationError } = await service.from("story_translations").insert(
    (data ?? []).map((story) => ({
      story_id: story.id,
      target_language: "en",
      source_hash: `e2e-translation-${story.id}`,
      title: story.source_kind === "seed" ? "Strangers in the Garden" : "My Evening in the Community Garden",
      excerpt: "A quiet evening of cooperation in a community garden helped strangers become familiar partners.",
      body: "On the weekend, I joined several neighbors in the community garden to organize old books and flowerpots. We were reserved at first, but gradually became familiar while sharing tools and checking where everything belonged. By evening, the once-messy corner was tidy. The experience reminded me that patience, cooperation, and sincere conversation can help strangers complete something meaningful together.",
      themes: ["Community", "Kindness"],
      mood: "Calm",
      life_stage: "Early adulthood",
      people: ["Myself", "Strangers"],
      city: story.source_kind === "seed" ? "Beijing" : "Shanghai",
      model: "e2e-cache",
      prompt_version: "e2e-v1",
    })),
  );
  if (translationError) throw translationError;
  const ownStory = data?.find((story) => story.user_id === account.id);
  const seedStory = data?.find((story) => story.source_kind === "seed");
  const { data: config, error: configError } = await service
    .from("algorithm_configs")
    .select("id")
    .eq("status", "published")
    .order("version", { ascending: false })
    .limit(1)
    .single();
  if (configError || !config || !ownStory || !seedStory)
    throw configError ?? new Error("E2E recommendation fixture failed");
  const { data: batch, error: batchError } = await service
    .from("recommendation_batches")
    .insert({
      user_id: account.id,
      reference_story_id: ownStory.id,
      algorithm_config_id: config.id,
      formula_version: "e2e-recommendation-v1",
      city_mode: "similar",
      stage_mode: "different",
      theme_mode: "similar",
    })
    .select("id")
    .single();
  if (batchError || !batch) throw batchError ?? new Error("E2E recommendation batch failed");
  const { error: resultError } = await service.from("recommendation_results").insert({
    batch_id: batch.id,
    story_id: seedStory.id,
    rank: 1,
    city_score: 0.32,
    life_score: 0.68,
    theme_score: 0.84,
    semantic_score: 0.89,
    final_score: 0.82,
  });
  if (resultError) throw resultError;
  return { seedAuthor, stories: data ?? [] };
}

export async function openGatewayAuth(page: Page, mode: "signup" | "login") {
  await page.goto("/");
  await page.getByRole("button", { name: /跳过|Skip/ }).click();
  const auth = page.locator("#storyverse-auth");
  await expect(auth).toBeVisible();
  await auth
    .getByRole("button", { name: mode === "signup" ? /^注册$|^Sign up$/ : /^登录$|^Log in$/ })
    .first()
    .click();
}

export async function loginThroughUi(page: Page, account: TestAccount) {
  await openGatewayAuth(page, "login");
  await page.getByLabel(/^账号|^Username/).fill(account.username);
  await page.getByLabel(/^密码|^Password/).fill(account.password);
  await page.getByRole("button", { name: /进入 StoryVerse|Enter StoryVerse/ }).click();
}

export function expectNoHorizontalOverflow(page: Page) {
  return expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1))
    .toBe(true);
}
