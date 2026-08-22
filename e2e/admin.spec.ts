import { expect, test } from "@playwright/test";
import { cleanupAccounts, createAccount, finishBrowserActivity, type TestAccount } from "./support/storyverse-fixture";

test.describe("管理员入口与权限", () => {
  const accounts: TestAccount[] = [];
  test.afterEach(async ({ page }) => {
    await finishBrowserActivity(page);
    await cleanupAccounts(accounts.splice(0));
  });

  test("普通账号被拒绝，管理员可进入并查看前后测视图", async ({ page }) => {
    const user = await createAccount({ pretestRequired: false });
    const admin = await createAccount({ pretestRequired: false, role: "admin", displayName: "E2E 管理员" });
    accounts.push(user, admin);

    await page.goto("/Admin");
    await page.getByLabel(/管理员账号/).fill(user.username);
    await page.getByLabel(/^密码/).fill(user.password);
    await page.getByRole("button", { name: /进入管理台/ }).click();
    await expect(page.locator(".admin-gate-error")).toContainText(/没有管理员权限/);

    await page.getByLabel(/管理员账号/).fill(admin.username);
    await page.getByLabel(/^密码/).fill(admin.password);
    await page.getByRole("button", { name: /进入管理台/ }).click();
    await expect(page.getByRole("navigation", { name: /后台功能/ })).toBeVisible();
    await page.getByRole("button", { name: /前测数据/ }).click();
    await expect(page.getByText(/按登录账号筛选/)).toBeVisible();
    await page.getByRole("button", { name: /后测数据/ }).click();
    await expect(page.getByText(/全部 41 道题/)).toBeVisible();
  });
});
