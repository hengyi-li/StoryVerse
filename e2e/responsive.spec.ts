import { expect, test } from "@playwright/test";
import { expectNoHorizontalOverflow } from "./support/storyverse-fixture";

test.describe("移动端、深路由与基础可访问性", () => {
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
});
