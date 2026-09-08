import { expect, test } from "@playwright/test";

import { registerTestUser } from "./support/auth";
import { expectMainVisible, watchPage } from "./support/diagnostics";

test.describe("内容发布", () => {
  test("填写、保存草稿并发布一份菜谱", async ({ page }, testInfo) => {
    test.skip(process.env.E2E_TARGET === "production", "Production writes run in the guarded production suite.");
    const finish = watchPage(page, testInfo, [/\/api\/backend\/auth\/me$/]);
    await registerTestUser(page, testInfo);
    await page.goto("/zh/posts/new");

    const marker = Date.now();
    const title = `自动验收番茄炒蛋 ${marker}`;
    await page.getByPlaceholder("例如：外婆红烧肉、五分钟快手早餐").fill(title);
    await page.getByPlaceholder(/简单描述这道菜/).fill("用于自动验收发布流程的家常菜谱，完成后只保留在隔离数据库。 ");

    const ingredient = page.locator(".fp-tag-input").nth(0);
    await ingredient.fill("番茄 2 个");
    await ingredient.press("Enter");
    await ingredient.fill("鸡蛋 3 个");
    await ingredient.press("Enter");
    const equipment = page.locator(".fp-tag-input").nth(1);
    await equipment.fill("炒锅");
    await equipment.press("Enter");
    const tag = page.locator(".fp-tag-input").nth(2);
    await tag.fill("家常");
    await tag.press("Enter");
    await page.getByPlaceholder("第1步").fill("番茄切块，鸡蛋打散后分别炒熟，再合炒调味。");

    await page.getByRole("button", { name: "存为草稿" }).click();
    await expect(page.getByText(/草稿保存于/)).toBeVisible();
    await page.locator("button[type='submit']").click();
    await expect(page).toHaveURL(/\/zh\/packs\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("heading", { name: "制作步骤" })).toBeVisible();
    await expectMainVisible(page);
    await finish();
  });
});
