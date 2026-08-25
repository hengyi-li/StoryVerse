import { expect, test } from "@playwright/test";
import {
  cleanupAccounts,
  createAccount,
  finishBrowserActivity,
  seedLobby,
  service,
  type TestAccount,
} from "./support/storyverse-fixture";

test.describe("管理员入口与权限", () => {
  const accounts: TestAccount[] = [];
  test.afterEach(async ({ page }) => {
    await finishBrowserActivity(page);
    await cleanupAccounts(accounts.splice(0));
  });

  test("普通账号被拒绝，管理员可进入并查看前后测视图", async ({ page }) => {
    test.setTimeout(150_000);
    const user = await createAccount({ pretestRequired: false });
    const admin = await createAccount({ pretestRequired: false, role: "admin", displayName: "E2E 管理员" });
    accounts.push(user, admin);
    const seeded = await seedLobby(user);
    accounts.push(seeded.seedAuthor);
    const ownStory = seeded.stories.find((story) => story.source_kind === "user");
    const seedStory = seeded.stories.find((story) => story.source_kind === "seed");
    expect(ownStory?.id).toBeTruthy();
    expect(seedStory?.id).toBeTruthy();
    const [ownStoryUpdate, seedStoryUpdate] = await Promise.all([
      service
        .from("stories")
        .update({ published_at: "2026-08-20T12:00:00.000Z", status: "published" })
        .eq("id", ownStory!.id),
      service
        .from("stories")
        .update({ published_at: "2026-08-22T12:00:00.000Z", status: "removed" })
        .eq("id", seedStory!.id),
    ]);
    if (ownStoryUpdate.error) throw ownStoryUpdate.error;
    if (seedStoryUpdate.error) throw seedStoryUpdate.error;

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

    await page.getByRole("button", { name: /故事管理/ }).click();
    await expect(page.getByText(`@${user.username}`, { exact: false })).toBeVisible();
    await expect(page.getByText(`@${seeded.seedAuthor.username}`, { exact: false })).toBeVisible();

    const usernameFilter = page.getByLabel("登录账号", { exact: true });
    await usernameFilter.fill(`@${user.username}`);
    await expect(page.getByText("我的社区花园傍晚", { exact: true })).toBeVisible();
    await expect(page.getByText("花园里的陌生伙伴", { exact: true })).toBeHidden();

    await usernameFilter.fill("");
    await page.getByLabel("故事状态", { exact: true }).selectOption("removed");
    await expect(page.getByText("花园里的陌生伙伴", { exact: true })).toBeVisible();
    await expect(page.getByText("我的社区花园傍晚", { exact: true })).toBeHidden();

    await page.getByRole("button", { name: "清除筛选" }).click();
    await page.getByLabel("发布开始日期", { exact: true }).fill("2026-08-22");
    await page.getByLabel("发布结束日期", { exact: true }).fill("2026-08-22");
    await expect(page.getByText("花园里的陌生伙伴", { exact: true })).toBeVisible();
    await expect(page.getByText("我的社区花园傍晚", { exact: true })).toBeHidden();

    await page.getByRole("button", { name: "清除筛选" }).click();
    await page.getByLabel("搜索故事", { exact: true }).fill("社区花园");
    await page.getByLabel("排序字段", { exact: true }).selectOption("username");
    const direction = page.getByRole("button", { name: "切换排序方向" });
    await direction.click();
    await expect(direction).toContainText("升序");
    const authorLabels = await page.locator(".admin-data-row.is-story .admin-story-author").allTextContents();
    expect(authorLabels.length).toBeGreaterThanOrEqual(2);
    expect(authorLabels).toEqual([...authorLabels].sort((left, right) => left.localeCompare(right)));
  });
});
