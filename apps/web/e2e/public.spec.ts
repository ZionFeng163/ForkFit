import { expect, test } from "@playwright/test";

import { expectMainVisible, watchPage } from "./support/diagnostics";

test.describe("公共浏览", () => {
  test("@smoke 首页说明产品并可进入规划", async ({ page }, testInfo) => {
    const finish = watchPage(page, testInfo);
    await page.goto("/zh", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("吃什么");
    await expect(page.getByRole("button", { name: "开始规划" })).toBeVisible();
    await expect(page.getByRole("link", { name: /先逛菜谱/ })).toBeVisible();
    await expectMainVisible(page);
    await finish();
  });

  test("@smoke 发现页可筛选和搜索", async ({ page }, testInfo) => {
    const finish = watchPage(page, testInfo);
    await page.goto("/zh/discover", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "发现菜谱" })).toBeVisible();
    const cards = page.locator("article").filter({ has: page.getByRole("button", { name: /加入计划|已加入/ }) });
    await expect(cards.first()).toBeVisible();
    const initialCount = await cards.count();
    expect(initialCount).toBeGreaterThan(0);

    await page.getByRole("button", { name: "家常", exact: true }).click();
    await expect(page).toHaveURL(/category=/);
    await expect(cards.first()).toBeVisible();

    const search = page.locator("main").first().getByPlaceholder("搜索菜谱...").first();
    await search.fill("鸡");
    await expect(page).toHaveURL(/q=/);
    await expectMainVisible(page);
    await finish();
  });

  test("@smoke 菜谱详情具备做菜信息和登录回跳", async ({ page }, testInfo) => {
    const finish = watchPage(page, testInfo);
    await page.goto("/zh/discover", { waitUntil: "domcontentloaded" });
    const recipe = page.locator("article a[href*='/packs/']").first();
    await recipe.click();
    await expect(page).toHaveURL(/\/zh\/packs\//);
    await expect(page.getByRole("heading", { name: "制作步骤" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "食材" })).toBeVisible();
    await expect(page.getByRole("button", { name: "收藏" })).toBeVisible();
    await page.getByRole("button", { name: "收藏" }).click();
    await expect(page).toHaveURL(/\/zh\/login\?returnTo=/);
    await expectMainVisible(page);
    await finish();
  });
});
