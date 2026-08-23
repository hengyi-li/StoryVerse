import { expect, test } from "@playwright/test";
import {
  cleanupAccounts,
  completePretest,
  createAccount,
  finishBrowserActivity,
  loginThroughUi,
  seedLobby,
  service,
  type TestAccount,
} from "./support/storyverse-fixture";

test.describe("StarLobby 阅读、反馈与后测", () => {
  const accounts: TestAccount[] = [];
  test.afterEach(async ({ page }) => {
    await finishBrowserActivity(page);
    await cleanupAccounts(accounts.splice(0));
  });

  test("星点可访问列表、搜索、反应反馈和 41 题后测完整提交", async ({ page }) => {
    const account = await createAccount({ displayName: "大厅 E2E 用户" });
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

    await expect(page.getByRole("status", { name: /后测问卷提醒/ })).toBeVisible();
    await page.getByRole("button", { name: /展开搜索|Open search/ }).click();
    const search = page.getByPlaceholder(/搜索故事|Search stories/);
    await search.fill("花园");
    const storyStar = page.getByRole("button", { name: /打开星点故事.*花园里的陌生伙伴/ });
    await expect(storyStar).toBeVisible();
    // The semantic star list is visually offscreen behind the Three.js canvas,
    // but must remain operable for keyboard and assistive-technology users.
    await storyStar.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".story-panel")).toContainText("花园里的陌生伙伴");
    const matchScore = page.getByRole("button", { name: /查看共鸣匹配度详情/ });
    await expect(matchScore).toContainText("共鸣匹配度 82%");
    await matchScore.hover();
    const scoreDetails = page.getByRole("tooltip");
    await expect(scoreDetails).toContainText("综合参考了你的共鸣选择");
    await expect(scoreDetails).toContainText("人生背景偏好（相异）");
    await expect(scoreDetails).toContainText("68%");
    await expect(scoreDetails).toContainText("84%");
    await expect(scoreDetails).toContainText("89%");
    await page.locator(".story-panel h2").hover();
    await matchScore.hover();
    await expect
      .poll(async () => {
        const { count, error } = await service
          .from("analytics_events")
          .select("event_id", { count: "exact", head: true })
          .eq("user_id", account.id)
          .eq("event_name", "recommendation_score_breakdown_viewed");
        if (error) throw error;
        return count;
      })
      .toBe(1);
    await page.getByRole("button", { name: /^不喜欢$/ }).click();
    await expect(page.locator(".story-panel-reaction-feedback")).toBeVisible();
    await expect(page.getByRole("button", { name: /^已不喜欢$/ })).toHaveAttribute("aria-pressed", "true");
    await page
      .getByLabel(/关闭故事/)
      .first()
      .click();

    await page.getByRole("button", { name: /后测问卷待填写/ }).click();
    await expect(page).toHaveURL(/\/PostTest$/);
    await expect(page.locator(".posttest-step-heading h2")).toBeHidden();
    await expect(page.locator(".posttest-sidebar li div")).toHaveCount(0);
    await expect(page.locator(".posttest-step-heading > span")).toContainText("Part 1 of 5");
    await expect(page.locator(".posttest-scale-header")).toHaveCount(0);
    await page.getByRole("button", { name: /下一步 \/ Next/ }).click();
    await expect(page.getByRole("alert").first()).toContainText(/请选择一个分值/);

    for (let step = 1; step <= 5; step += 1) {
      const items = page.locator(".posttest-item");
      const count = await items.count();
      for (let index = 0; index < count; index += 1) {
        await items.nth(index).locator('input[value="4"]').check();
      }
      await page.getByRole("button", { name: step === 5 ? /提交问卷|Submit/ : /下一步 \/ Next/ }).click();
      if (step < 5) await expect(page.locator(".posttest-step-heading > span")).toContainText(`Part ${step + 1} of 5`);
    }

    await expect(page).toHaveURL(/\/StarLobby$/);
    await page.getByRole("button", { name: /后测问卷已完成/ }).click();
    const completedNotice = page.getByRole("status").filter({ hasText: /已经填写过后测问卷/ });
    await expect(completedNotice).toBeVisible();
    await expect(completedNotice).toBeHidden({ timeout: 7_000 });
  });
});
