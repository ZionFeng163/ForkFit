import { expect, test } from "@playwright/test";

import { registerTestUser } from "./support/auth";
import { expectMainVisible, watchPage } from "./support/diagnostics";

test.describe("登录用户主流程", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "The acceptance browser is Chromium.");

  test("收藏、点赞、评论和创建多日计划", async ({ page }, testInfo) => {
    const finish = watchPage(page, testInfo, [/\/api\/backend\/auth\/me$/]);
    await registerTestUser(page, testInfo);

    const firstRecipe = page.locator("article a[href*='/packs/']").first();
    await firstRecipe.click();
    await expect(page).toHaveURL(/\/zh\/packs\//);

    const save = page.getByRole("button", { name: "收藏" }).first();
    const like = page.getByRole("button", { name: "点赞" }).first();
    await save.click();
    await expect(save).toHaveAttribute("data-active", "true");
    await like.click();
    await expect(like).toHaveAttribute("data-active", "true");

    const comment = `自动验收评论 ${Date.now()}`;
    await page.getByPlaceholder("写一条评论...").fill(comment);
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByText(comment)).toBeVisible();
    await page.getByRole("button", { name: "删除评论" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "删除", exact: true }).click();
    await expect(page.getByText(comment)).toHaveCount(0);

    await page.getByRole("button", { name: "加入我的计划" }).click();
    await expect(page.getByRole("button", { name: "已加入我的计划" })).toBeVisible();

    await page.goto("/zh/discover");
    for (let count = 0; count < 2; count += 1) {
      await page.getByRole("button", { name: "加入计划", exact: true }).first().click();
    }
    await page.goto("/zh/meal-plans/new");
    await expect(page.getByText("已选 3 道 · 安排 3 天")).toBeVisible();
    await page.getByLabel("这几天有什么讲究").fill("少盐，工作日 30 分钟内，多一点蔬菜");
    await page.getByRole("button", { name: "生成菜单" }).click();
    await expect(page).toHaveURL(/\/zh\/meal-plans\/plan_/);
    await expectMainVisible(page);
    await finish();
  });
});
