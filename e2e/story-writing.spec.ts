import { expect, test, type Page } from "@playwright/test";
import {
  cleanupAccounts,
  createAccount,
  finishBrowserActivity,
  loginThroughUi,
  service,
  type TestAccount,
} from "./support/storyverse-fixture";

const body =
  "周末我来到社区图书馆，和几位第一次见面的志愿者一起整理旧书。开始时大家有些拘谨，只是安静地按照编号把书放回书架。后来我们发现一批标签贴错了位置，于是围在桌旁逐本核对，也在交谈中慢慢熟悉起来。傍晚离开时，凌乱的书架已经恢复整洁。这段普通经历让我意识到，耐心合作和真诚交流能够让陌生人一起完成有意义的事情。";

async function reachStoryWrite(page: Page, account: TestAccount) {
  await loginThroughUi(page, account);
  await expect(page).toHaveURL(/\/StoryStart$/);
  if (
    await page
      .locator(".tour-layer")
      .isVisible()
      .catch(() => false)
  )
    await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /重新拿回选择/ }).click();
  await page.getByRole("button", { name: /带着这个提示继续/ }).click();
  await expect(page).toHaveURL(/\/StoryWrite$/);
  if (
    await page
      .locator(".tour-layer")
      .isVisible()
      .catch(() => false)
  )
    await page.keyboard.press("Escape");
}

async function fillStory(page: Page) {
  await page.getByLabel(/标题/).fill("一次安静的社区协作");
  await page.getByLabel(/你的故事/).fill(body);
  await page.getByRole("button", { name: /平和自足/ }).click();
  await page.getByLabel(/当时所处的人生阶段/).selectOption("成年早期");
  await page.getByRole("combobox", { name: /城市/ }).fill("上海");
  await page.getByLabel(/年龄/).fill("29");
  await page.getByLabel(/性别/).selectOption("男");
  await page.getByRole("button", { name: /^自己$/ }).click();
}

test.describe("故事写作与恢复", () => {
  const accounts: TestAccount[] = [];
  test.afterEach(async ({ page }) => {
    await finishBrowserActivity(page);
    await cleanupAccounts(accounts.splice(0));
  });

  test("必填校验、100 字边界与自动保存通过真实页面落库", async ({ page }) => {
    const account = await createAccount({ pretestRequired: false });
    accounts.push(account);
    await reachStoryWrite(page, account);

    await page.getByRole("button", { name: /故事写好了/ }).click();
    await expect(page.locator(".completion-hint.warn")).toContainText(/还差一点/);
    await page.getByLabel(/你的故事/).fill("太短");
    await page.getByRole("button", { name: /故事写好了/ }).click();
    await expect(page.locator(".completion-hint.warn")).toContainText(/你的故事/);

    await fillStory(page);
    await expect(page.locator(".completion-hint")).not.toHaveClass(/warn/);
    await expect
      .poll(
        async () => {
          const { data } = await service
            .from("story_drafts")
            .select("body,city,age,gender,people")
            .eq("user_id", account.id)
            .maybeSingle();
          return data?.body === body && data.city === "上海" && data.age === 29 && data.gender === "男";
        },
        { timeout: 10_000 },
      )
      .toBe(true);

    await page.reload();
    await expect(page).toHaveURL(/\/StoryWrite$/);
    await expect(page.getByLabel(/你的故事/)).toHaveValue(body);
    await expect(page.getByRole("combobox", { name: /城市/ })).toHaveValue("上海");
  });

  test("@real-ai 从写作、AI 整理、图片、确认发布、共鸣选择进入 StarLobby", async ({ page }) => {
    test.setTimeout(240_000);
    const account = await createAccount({ pretestRequired: false, displayName: "AI E2E 用户" });
    accounts.push(account);
    await reachStoryWrite(page, account);
    await fillStory(page);
    await page.getByRole("button", { name: /故事写好了/ }).click();
    await expect(page).toHaveURL(/\/StoryAnalyzing$/);

    const openStoryPage = page.getByRole("button", { name: /查收你的故事页面|进入星空大厅/ });
    await expect(openStoryPage).toBeVisible({ timeout: 120_000 });
    if ((await openStoryPage.textContent())?.includes("进入星空大厅")) {
      await openStoryPage.click();
      await expect(page).toHaveURL(/\/StarLobby$/);
      return;
    }
    await openStoryPage.click();
    await expect(page).toHaveURL(/\/StoryPage$/);
    if (
      await page
        .locator(".tour-layer")
        .isVisible()
        .catch(() => false)
    )
      await page.keyboard.press("Escape");

    await expect(page.getByText(/本图片为 AIGC 生成内容，不代表 StoryVerse 团队立场/)).toBeVisible();
    await page.getByRole("button", { name: /生成故事图片/ }).click();
    const generatedImage = page.locator(".single-story-image img");
    await expect(generatedImage).toBeVisible({ timeout: 150_000 });
    await expect
      .poll(() => generatedImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    expect(await generatedImage.evaluate((image: HTMLImageElement) => image.naturalWidth === image.naturalHeight)).toBe(
      true,
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /下载图片/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.(?:png|jpe?g|webp)$/i);

    await page.getByRole("button", { name: /点亮我的故事星点/ }).click();
    await expect(page).toHaveURL(/\/Resonance$/);
    if (
      await page
        .locator(".tour-layer")
        .isVisible()
        .catch(() => false)
    )
      await page.keyboard.press("Escape");
    await page.getByRole("button", { name: /进入 StoryVerse/ }).click();
    await expect(page).toHaveURL(/\/StarLobby$/);
  });
});
