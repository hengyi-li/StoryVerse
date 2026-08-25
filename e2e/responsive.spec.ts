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

async function verifyTouchSelect(page: import("@playwright/test").Page, field: string, targetValue?: string) {
  const root = page.locator(`[data-field="${field}"]`);
  const trigger = root.locator(".pretest-select-trigger");
  const before = await trigger.innerText();
  await trigger.evaluate((node: HTMLButtonElement) => node.click());
  const menu = root.locator(".pretest-select-menu");
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((node) => getComputedStyle(node).touchAction)).toBe("pan-y");

  const canScroll = await menu.evaluate((node) => node.scrollHeight > node.clientHeight + 1);
  if (canScroll) {
    await menu.evaluate((node) => {
      node.scrollTop = 0;
    });
    await menu.hover();
    await page.mouse.wheel(0, 180);
    await expect.poll(() => menu.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    await menu.evaluate((node) => {
      node.scrollTop = 0;
    });
  }

  const gestureOption = menu.locator("[data-option-value]").first();
  await gestureOption.dispatchEvent("pointerdown", {
    bubbles: true,
    pointerId: 71,
    pointerType: "touch",
    isPrimary: true,
    clientX: 180,
    clientY: 540,
  });
  await gestureOption.dispatchEvent("pointermove", {
    bubbles: true,
    pointerId: 71,
    pointerType: "touch",
    isPrimary: true,
    clientX: 180,
    clientY: 450,
  });
  await gestureOption.dispatchEvent("pointerup", {
    bubbles: true,
    pointerId: 71,
    pointerType: "touch",
    isPrimary: true,
    clientX: 180,
    clientY: 450,
  });
  await expect(menu).toBeVisible();
  expect(await trigger.innerText()).toBe(before);

  const target = targetValue
    ? menu.locator(`[data-option-value="${targetValue}"]`)
    : menu.locator("[data-option-value]").first();
  const selectedValue = await target.getAttribute("data-option-value");
  if (!selectedValue) throw new Error(`No selectable option found for ${field}`);
  await target.dispatchEvent("pointerdown", {
    bubbles: true,
    pointerId: 72,
    pointerType: "touch",
    isPrimary: true,
    clientX: 180,
    clientY: 500,
  });
  await target.dispatchEvent("pointerup", {
    bubbles: true,
    pointerId: 72,
    pointerType: "touch",
    isPrimary: true,
    clientX: 180,
    clientY: 500,
  });
  await expect(menu).toBeHidden();
  await expect.poll(() => trigger.innerText()).not.toBe(before);
  return selectedValue;
}

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
    const recoveryAnswer = auth.getByLabel(/^Password recovery answer/);
    const nickname = auth.getByLabel(/^Nickname/);
    const recoveryBox = await recoveryAnswer.boundingBox();
    const nicknameBox = await nickname.boundingBox();
    expect(recoveryBox && nicknameBox && nicknameBox.y > recoveryBox.y).toBe(true);
    await expect(auth.getByText("Others will see this instead of username")).toBeVisible();
    const loginWordmark = auth.locator(".gateway-login-wordmark");
    await expect(loginWordmark).toBeVisible();
    expect((await loginWordmark.boundingBox())?.width).toBeGreaterThanOrEqual(180);
    await username.focus();
    await expect(username).toBeFocused();
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("type"))).toBe("password");
  });

  test("手机欢迎页署名更小且正文不会横向溢出", async ({ page }) => {
    await page.goto("/");
    const author = page.locator(".gateway-preview-quote cite");
    await author.scrollIntoViewIfNeeded();
    await expect(author).toBeVisible();
    const sizes = await page.locator(".gateway-preview-quote").evaluate((node) => ({
      quote: Number.parseFloat(getComputedStyle(node).fontSize),
      author: Number.parseFloat(getComputedStyle(node.querySelector("cite")!).fontSize),
    }));
    expect(sizes.author).toBeLessThan(sizes.quote);
    await expectNoHorizontalOverflow(page);
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
    const dockItems = page.locator(".floating-nav .dock-item");
    await expect(dockItems).toHaveCount(4);
    for (let index = 0; index < 4; index += 1) {
      await expect(dockItems.nth(index).locator(".nav-icon")).toBeVisible();
      await expect(dockItems.nth(index).locator(".nav-label")).toBeHidden();
    }
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

  test("手机语音按钮只聚焦故事正文并显示系统听写引导", async ({ page }) => {
    const account = await createAccount({ displayName: "手机听写 E2E", pretestRequired: false });
    accounts.push(account);
    await loginThroughUi(page, account);
    await expect(page).toHaveURL(/\/StoryStart$/);
    await page.goto("/StoryWrite");
    await expect(page).toHaveURL(/\/StoryWrite$/);
    const storyTour = page.locator(".tour-layer");
    await storyTour
      .waitFor({ state: "visible", timeout: 5_000 })
      .then(() => storyTour.locator(".tour-skip").click())
      .catch(() => undefined);
    await expect(storyTour).toBeHidden();
    const voiceButton = page.locator('[data-voice-mode="system-keyboard"]');
    await expect(voiceButton).toContainText(/使用键盘语音输入|Use keyboard dictation/);
    await voiceButton.click();
    const body = page.locator("textarea[data-story-body-input]");
    await expect(body).toBeFocused();
    await expect(page.locator("#system-dictation-guide")).toBeVisible();
    await expect(page.getByLabel(/^标题/)).not.toBeFocused();
    await expectNoHorizontalOverflow(page);
  });

  test("安卓式触摸下所有前测下拉框都能滚动且不会误选", async ({ page }) => {
    test.setTimeout(120_000);
    const account = await createAccount({ displayName: "全下拉触摸 E2E" });
    accounts.push(account);
    await loginThroughUi(page, account);
    await expect(page).toHaveURL(/\/PreTest$/);

    await page.getByRole("button", { name: /同意 \/ Agree/ }).click();
    await page.getByRole("button", { name: /继续 \/ Continue/ }).click();
    await verifyTouchSelect(page, "birthYear", "1995");
    await verifyTouchSelect(page, "gender", "female");
    await verifyTouchSelect(page, "residenceRegion", "china_mainland");
    await verifyTouchSelect(page, "province", "he_bei_sheng");
    await verifyTouchSelect(page, "city", "shi_jia_zhuang_shi");
    await verifyTouchSelect(page, "communityType", "residents_committee");
    await page.getByRole("button", { name: /继续 \/ Continue/ }).click();
    await expect(page.getByText("03 / 04")).toBeVisible();

    await verifyTouchSelect(page, "ethnicity", "han_zu");
    await verifyTouchSelect(page, "education", "bachelor");
    await page.getByRole("button", { name: /继续 \/ Continue/ }).click();
    await expect(page.getByText("04 / 04")).toBeVisible();

    await verifyTouchSelect(page, "employment", "full_time");
    await verifyTouchSelect(page, "industryPrimary");
    await verifyTouchSelect(page, "industrySecondary");
    await verifyTouchSelect(page, "employment", "student_unpaid");
    await expect(page.locator('[data-field="industryPrimary"]')).toHaveCount(0);
    await verifyTouchSelect(page, "discipline");
    await verifyTouchSelect(page, "major");
    await page.getByRole("button", { name: /提交并开始|Submit & begin/ }).click();
    await expect(page).toHaveURL(/\/StoryStart$/);
    await expectNoHorizontalOverflow(page);
  });
});
