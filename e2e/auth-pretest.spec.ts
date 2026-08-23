import { expect, test, type Page } from "@playwright/test";
import {
  cleanupAccountByUsername,
  finishBrowserActivity,
  openGatewayAuth,
  uniqueAccount,
} from "./support/storyverse-fixture";

async function selectPretestOption(page: Page, field: string, value: string) {
  const root = page.locator(`[data-field="${field}"]`);
  await root.locator(".pretest-select-trigger").click();
  await root.locator(`[data-option-value="${value}"]`).click();
}

test.describe("账号与前测门禁", () => {
  const createdUsernames: string[] = [];

  test.afterEach(async ({ page }) => {
    await finishBrowserActivity(page);
    await Promise.all(createdUsernames.splice(0).map((username) => cleanupAccountByUsername(username)));
  });

  test("新用户不能绕过前测，草稿可刷新恢复，完成后进入 StoryStart", async ({ page }) => {
    const username = uniqueAccount("pre");
    createdUsernames.push(username);
    await openGatewayAuth(page, "signup");

    const account = page.getByLabel(/^账号|^Username/);
    await account.fill("bad name");
    await account.blur();
    await expect(page.getByRole("alert")).toContainText(/字母、数字|letters, numbers/i);

    await page.getByLabel(/^昵称|^Nickname/).fill("前测浏览器用户");
    await account.fill(username);
    await page.getByLabel(/^密码|^Password/).fill("StoryVerse-E2E-2026!");
    await page.getByLabel(/^确认密码|^Confirm password/).fill("StoryVerse-E2E-2026!");
    await page.getByLabel(/^找回密码问题|^Password recovery question/).selectOption("first_school");
    await page.getByLabel(/^找回密码答案|^Password recovery answer/).fill("测试学校");
    await page.getByRole("button", { name: /创建账户|Create account/ }).click();

    await expect(page).toHaveURL(/\/PreTest$/);
    await expect(page.getByText("Before you begin StoryVerse")).toBeVisible();
    await expect(page.getByRole("img", { name: /home interface preview/i })).toBeVisible();
    await expect(page.getByRole("img", { name: /StarLobby interface preview/i })).toBeVisible();

    await page.goto("/StarLobby");
    await expect(page).toHaveURL(/\/PreTest$/);

    await page.getByRole("button", { name: /继续 \/ Continue/ }).click();
    await expect(page.getByText(/请选择同意或不同意/)).toBeVisible();
    await page.getByRole("button", { name: /同意 \/ Agree/ }).click();
    await page.getByRole("button", { name: /继续 \/ Continue/ }).click();

    await selectPretestOption(page, "birthYear", "1995");
    await expect(page.locator('[data-field="birthYear"] .pretest-select-trigger')).toHaveText("1995");
    await selectPretestOption(page, "gender", "male");
    await selectPretestOption(page, "residenceRegion", "overseas");
    await page.locator('[data-field="countryRegion"] input').fill("Singapore");
    await page.getByRole("button", { name: /继续 \/ Continue/ }).click();
    await expect(page.getByText("03 / 04")).toBeVisible();

    await page.reload();
    await expect(page.getByText("03 / 04")).toBeVisible();
    await expect(page.locator('[data-field="ethnicity"]')).toBeVisible();
    await selectPretestOption(page, "ethnicity", "not_chinese_citizen");
    await selectPretestOption(page, "education", "bachelor");
    await page.getByRole("button", { name: /继续 \/ Continue/ }).click();

    const employment = page.locator('[data-field="employment"]');
    await employment.locator(".pretest-select-trigger").click();
    const longOption = employment.locator('[data-option-value="full_time"]');
    await expect(longOption.locator("small[lang='en']")).toBeVisible();
    expect(
      await longOption.evaluate((node) => {
        const zh = node.querySelector<HTMLElement>("span[lang='zh-CN']")!.getBoundingClientRect();
        const en = node.querySelector<HTMLElement>("small[lang='en']")!.getBoundingClientRect();
        return en.top >= zh.bottom;
      }),
    ).toBe(true);
    await longOption.click();
    await expect(page.locator('[data-field="industryPrimary"]')).toBeVisible();
    await selectPretestOption(page, "employment", "student_unpaid");
    await expect(page.locator('[data-field="industryPrimary"]')).toHaveCount(0);
    await expect(page.locator('[data-field="discipline"]')).toBeVisible();
    const discipline = page.locator('[data-field="discipline"]');
    await discipline.locator(".pretest-select-trigger").click();
    await discipline.locator("[data-option-value]").first().click();
    const major = page.locator('[data-field="major"]');
    await major.locator(".pretest-select-trigger").click();
    await major.locator("[data-option-value]").first().click();
    await page.getByRole("button", { name: /提交并开始|Submit & begin/ }).click();

    await expect(page).toHaveURL(/\/StoryStart$/);
    await expect(page.getByText(/你最想分享的人生故事|What story do you most want to share/)).toBeVisible();
    await page.goto("/PreTest");
    await expect(page).toHaveURL(/\/StoryStart$/);
  });

  test("选择不同意后清空答案并退出，受保护页面不可进入", async ({ page }) => {
    const username = uniqueAccount("decline");
    createdUsernames.push(username);
    await openGatewayAuth(page, "signup");
    await page.getByLabel(/^昵称|^Nickname/).fill("拒绝前测用户");
    await page.getByLabel(/^账号|^Username/).fill(username);
    await page.getByLabel(/^密码|^Password/).fill("StoryVerse-E2E-2026!");
    await page.getByLabel(/^确认密码|^Confirm password/).fill("StoryVerse-E2E-2026!");
    await page.getByLabel(/^找回密码问题|^Password recovery question/).selectOption("first_school");
    await page.getByLabel(/^找回密码答案|^Password recovery answer/).fill("测试学校");
    await page.getByRole("button", { name: /创建账户|Create account/ }).click();
    await expect(page).toHaveURL(/\/PreTest$/);

    await page.getByRole("button", { name: /不同意 \/ Disagree/ }).click();
    await expect(page.getByText("Thank you for reviewing the study information")).toBeVisible();
    await page.goto("/StoryStart");
    await expect(page).toHaveURL(/\/$/);
  });
});
