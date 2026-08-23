import { expect, test } from "@playwright/test";
import {
  cleanupAccounts,
  completePretest,
  createAccount,
  expectNoHorizontalOverflow,
  finishBrowserActivity,
  loginThroughUi,
  seedLobby,
  type TestAccount,
} from "./support/storyverse-fixture";

test.describe("移动端、深路由与基础可访问性", () => {
  const accounts: TestAccount[] = [];
  test.afterEach(async ({ page }) => {
    await finishBrowserActivity(page);
    await cleanupAccounts(accounts.splice(0));
  });

  for (const width of [320, 390, 768]) {
    test(`首页在 ${width}px 下无横向溢出`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1024 });
      await page.goto("/");
      await expect(page.locator("main")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test("首页在 390px 下无横向溢出，语言、主题和登录区可键盘访问", async ({ page }) => {
    await page.goto("/");
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: /切换语言/ }).click();
    await expect(page.getByRole("button", { name: /Switch language/ })).toBeVisible();
    await page.getByRole("button", { name: /Switch day \/ night mode/ }).click();
    await page.getByRole("button", { name: /Skip/ }).click();
    const auth = page.locator("#storyverse-auth");
    await expect(auth).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const username = auth.getByLabel(/^Username/);
    await username.focus();
    await expect(username).toBeFocused();
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("type"))).toBe("password");
  });

  for (const route of ["/PreTest", "/PostTest", "/StoryStart", "/StoryWrite", "/StoryPage", "/StarLobby"]) {
    test(`未登录直接刷新 ${route} 不白屏并回到安全入口`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
      await expect(page.locator("main")).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("手机端点击综合匹配度可展开和关闭分项，且不产生横向溢出", async ({ page }) => {
    const account = await createAccount({ displayName: "移动匹配度 E2E" });
    accounts.push(account);
    await completePretest(account);
    const seeded = await seedLobby(account);
    accounts.push(seeded.seedAuthor);

    await loginThroughUi(page, account);
    await expect(page).toHaveURL(/\/StarLobby$/);
    const skipTour = page.getByRole("button", { name: /跳过本页|Skip this page/ });
    await skipTour
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => skipTour.click())
      .catch(() => undefined);
    await page.getByRole("button", { name: /展开搜索|Open search/ }).click();
    await page.getByPlaceholder(/搜索故事|Search stories/).fill("花园");
    const storyStar = page.getByRole("button", { name: /打开星点故事.*花园里的陌生伙伴/ });
    await storyStar.focus();
    await page.keyboard.press("Enter");

    const matchScore = page.getByRole("button", { name: /查看共鸣匹配度详情/ });
    await expect(matchScore).toContainText("共鸣匹配度 82%");
    await matchScore.click();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await matchScore.click();
    await expect(page.getByRole("tooltip")).toBeHidden();
  });
});
