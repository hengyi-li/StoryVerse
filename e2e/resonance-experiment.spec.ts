import { expect, test } from "@playwright/test";
import {
  authenticatedService,
  cleanupAccounts,
  createAccount,
  finishBrowserActivity,
  loginThroughUi,
  seedLobby,
  service,
  type TestAccount,
} from "./support/storyverse-fixture";

function numericAccount(prefix: "AISA" | "AISB") {
  return `${prefix}${String(Date.now()).slice(-10)}`;
}

test.describe("账号前缀固定共鸣实验", () => {
  const accounts: TestAccount[] = [];

  test.afterEach(async ({ page }) => {
    await finishBrowserActivity(page);
    await cleanupAccounts(accounts.splice(0));
  });

  test("AISA/AISB 自动固定三个维度，AISA 无法修改且不显示共鸣入口", async ({ page }) => {
    const similar = await createAccount({
      username: numericAccount("AISA"),
      displayName: "AISA E2E",
      pretestRequired: false,
    });
    const different = await createAccount({
      username: numericAccount("AISB"),
      displayName: "AISB E2E",
      pretestRequired: false,
    });
    accounts.push(similar, different);

    const { data: preferences, error: preferenceError } = await service
      .from("resonance_preferences")
      .select("user_id,city_mode,stage_mode,theme_mode")
      .in("user_id", [similar.id, different.id]);
    if (preferenceError) throw preferenceError;
    expect(preferences?.find((item) => item.user_id === similar.id)).toMatchObject({
      city_mode: "similar",
      stage_mode: "similar",
      theme_mode: "similar",
    });
    expect(preferences?.find((item) => item.user_id === different.id)).toMatchObject({
      city_mode: "different",
      stage_mode: "different",
      theme_mode: "different",
    });

    const { data: lockedUpdateRows, error: lockedUpdateError } = await authenticatedService(similar)
      .from("resonance_preferences")
      .update({ city_mode: "different", stage_mode: "different", theme_mode: "different" })
      .eq("user_id", similar.id)
      .select("user_id");
    expect(lockedUpdateError).toBeNull();
    expect(lockedUpdateRows).toEqual([]);

    const { data: lockedPreferences, error: lockedPreferencesError } = await service
      .from("resonance_preferences")
      .select("city_mode,stage_mode,theme_mode")
      .eq("user_id", similar.id)
      .single();
    if (lockedPreferencesError) throw lockedPreferencesError;
    expect(lockedPreferences).toEqual({
      city_mode: "similar",
      stage_mode: "similar",
      theme_mode: "similar",
    });

    const seeded = await seedLobby(similar);
    accounts.push(seeded.seedAuthor);
    await loginThroughUi(page, similar);
    await expect(page).toHaveURL(/\/StarLobby$/);
    await expect(page.getByRole("button", { name: /共鸣偏好|Preferences/ })).toHaveCount(0);

    await page.goto("/Resonance");
    await expect(page).toHaveURL(/\/StarLobby$/);
    await expect(page.getByRole("button", { name: /共鸣偏好|Preferences/ })).toHaveCount(0);

    await expect
      .poll(
        async () => {
          const { data, error } = await service
            .from("analytics_events")
            .select("condition_id")
            .eq("user_id", similar.id)
            .eq("event_name", "star_lobby_viewed")
            .order("occurred_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          return data?.condition_id;
        },
        { timeout: 15_000 },
      )
      .toBe("resonance_all_similar");
  });

  test("普通账号仍可进入共鸣页并在 StarLobby 修改偏好", async ({ page }) => {
    const ordinary = await createAccount({ pretestRequired: false, displayName: "普通共鸣 E2E" });
    accounts.push(ordinary);
    const seeded = await seedLobby(ordinary);
    accounts.push(seeded.seedAuthor);

    await loginThroughUi(page, ordinary);
    await expect(page).toHaveURL(/\/StarLobby$/);
    await expect(page.getByRole("button", { name: /共鸣偏好|Preferences/ })).toBeVisible();
    await page.goto("/Resonance");
    await expect(page).toHaveURL(/\/Resonance$/);
    await expect(page.getByRole("button", { name: /进入 StoryVerse|Enter StoryVerse/ })).toBeVisible();
  });
});
