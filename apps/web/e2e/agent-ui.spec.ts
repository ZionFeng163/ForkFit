import { expect, test } from "@playwright/test";

import { registerTestUser } from "./support/auth";
import { expectMainVisible, watchPage } from "./support/diagnostics";

const meal = {
  id: "meal_e2e",
  day: "第 1 天",
  name: "少盐番茄牛肉锅",
  ingredients: ["牛肉 300 克", "番茄 2 个", "青菜 1 把"],
  equipment: ["炒锅"],
  cook_time_minutes: 28,
  tags: ["少盐", "家常"],
  notes: "出锅前再尝味，避免盐放多。",
  steps: ["番茄切块，牛肉切片。", "炒出番茄汁后加入牛肉和青菜煮熟。"],
  difficulty: "简单",
};

async function openFirstFork(page: import("@playwright/test").Page) {
  await page.goto("/zh/discover");
  await page.locator("article a[href*='/packs/']").first().click();
  await page.getByRole("link", { name: "按我的需求调整" }).first().click();
  await expect(page).toHaveURL(/\/zh\/packs\/[^/]+\/fork$/);
}

test.describe("Agent 用户界面", () => {
  test("提取口味并展示已完成的定制结果", async ({ page }, testInfo) => {
    const finish = watchPage(page, testInfo, [/\/api\/backend\/auth\/me$/]);
    await registerTestUser(page, testInfo);
    await page.route("**/api/backend/users/me/extract-preferences", async (route) => {
      await route.fulfill({ json: { preferences: { likes: ["番茄"], dislikes: ["香菜"], allergies: [], diet_rules: ["少盐"] } } });
    });
    await page.route("**/api/backend/runs", async (route) => {
      await route.fulfill({ status: 201, json: { run_id: "run_e2e", status: "queued" } });
    });
    await page.route("**/api/backend/runs/run_e2e", async (route) => {
      await route.fulfill({
        json: {
          run_id: "run_e2e", user_id: "user_e2e", status: "succeeded",
          created_at: new Date().toISOString(), started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
          result: {
            original_meal_pack: { id: "original", title: "原菜谱", theme: "家常", meals: [meal] },
            forked_meal_pack: { id: "forked", title: meal.name, theme: "家常", meals: [meal] },
            change_log: [{ affected_item: "调味", from_value: "原味", to_value: "少盐", reason: "符合用户要求", source_agent: "adaptation" }],
            unresolved_items: [], final_review: { agent: "guard", status: "pass", findings: [], scores: { safety: 1 } },
            summary: "保留番茄牛肉的家常味道，同时减少盐量。", description: "28 分钟可以完成。",
            safety_notices: [], quality_report: { status: "pass", issues: [], critic_used: false, repair_count: 0 },
          }, error: null, trace: null, unresolved_payload: null, saved: false,
        },
      });
    });

    await openFirstFork(page);
    const request = page.getByPlaceholder("例如：少盐、30 分钟内、多加蔬菜");
    await page.getByRole("button", { name: "沿用我的口味" }).click();
    await expect(request).toHaveValue(/喜欢：番茄[\s\S]*不喜欢：香菜[\s\S]*饮食限制：少盐/);
    await page.getByRole("button", { name: "开始定制" }).click();
    await expect(page.getByText("定制完成")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("heading", { name: meal.name })).toBeVisible();
    await expectMainVisible(page);
    await finish();
  });

  test("创建失败时保留用户输入并给出可重试错误", async ({ page }, testInfo) => {
    const finish = watchPage(page, testInfo, [/\/api\/backend\/auth\/me$/, /\/api\/backend\/runs$/]);
    await registerTestUser(page, testInfo);
    await page.route("**/api/backend/runs", async (route) => {
      await route.fulfill({ status: 503, json: { detail: "executor unavailable" } });
    });
    await openFirstFork(page);
    const request = page.getByPlaceholder("例如：少盐、30 分钟内、多加蔬菜");
    await request.fill("不要花生，20 分钟内");
    await page.getByRole("button", { name: "开始定制" }).click();
    await expect(page.getByText("服务暂时不可用，请稍后重试")).toBeVisible();
    await expect(request).toHaveValue("不要花生，20 分钟内");
    await finish();
  });
});
