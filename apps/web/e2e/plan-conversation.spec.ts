import { expect, test } from "@playwright/test";
import type { MealPlanConversation, MealPlanStatusResponse } from "../src/types/forkfit";
import { registerTestUser } from "./support/auth";
import { expectMainVisible, watchPage } from "./support/diagnostics";

test("受控 API：连续修改、提交失败保留输入、撤销刷新菜单", async ({ page }, testInfo) => {
  const finish = watchPage(page, testInfo, [/\/auth\/me$/, /\/conversation\/messages$/]);
  await registerTestUser(page, testInfo);
  const planId = "plan_conversation_e2e";
  const now = new Date().toISOString();
  const plan: MealPlanStatusResponse = {
    plan_id: planId, user_id: "e2e", status: "succeeded", mode: "guided",
    stage: "completed", progress: 100, workflow_version: "meal-plan-v4",
    created_at: now, started_at: now, finished_at: now, error: null,
    current_version_id: "v1", locked_days: [1],
    result: {
      title: "两天家常菜单", summary: "", mode: "guided", workflow_version: "meal-plan-v4",
      days: [1, 2].map((day) => ({
        day_index: day, label: `第 ${day} 天`, reason: "",
        dishes: [{
          source_post_id: `recipe_${day}`, reason: "",
          meal: {
            id: `recipe_${day}`, day: `第 ${day} 天`, name: day === 1 ? "番茄炒蛋" : "清蒸鱼",
            ingredients: [day === 1 ? "番茄 2 个" : "鱼 1 条"], steps: ["备好食材。", "煮熟后装盘。"],
            equipment: ["炒锅"], cook_time_minutes: 20, tags: [], notes: "", difficulty: "easy",
          },
        }],
      })),
      shopping_list: [{ name: "鱼", amount: "1 条", used_on: [2] }],
      prep_notes: [], decision_summary: "", agent_reports: [],
    },
  };
  const initialResult = structuredClone(plan.result!);
  const conversation: MealPlanConversation = { plan_id: planId, current_version_id: "v1", messages: [] };
  let rejectNext = false;
  let round = 0;
  await page.route("**/api/backend/posts/recipe_*", (route) => route.fulfill({ json: { image_urls: [] } }));
  await page.route(`**/api/backend/meal-plans/${planId}`, (route) => route.fulfill({ json: plan }));
  await page.route(`**/api/backend/meal-plans/${planId}/conversation`, (route) => route.fulfill({ json: conversation }));
  await page.route(`**/api/backend/meal-plans/${planId}/conversation/messages`, async (route) => {
    const body = route.request().postDataJSON();
    expect(body.base_version_id).toBe(plan.current_version_id);
    if (rejectNext) {
      rejectNext = false;
      await route.fulfill({ status: 503, json: { detail: "temporarily unavailable" } });
      return;
    }
    round += 1;
    if (body.text === "恢复上一版") {
      plan.result = structuredClone(initialResult);
    } else {
      plan.result!.days[1].dishes[0].meal.name = "香菇鸡肉";
      plan.result!.days[1].dishes[0].meal.ingredients = ["鸡肉 200 克"];
      plan.result!.shopping_list = [{ name: "鸡肉", amount: "200 克", used_on: [2] }];
    }
    plan.current_version_id = `v${round + 1}`;
    conversation.current_version_id = plan.current_version_id;
    conversation.messages.push({
      message_id: `msg_${round}`, plan_id: planId, role: "assistant", content: `已完成第 ${round} 次调整`,
      intent: "modify_day", status: "applied", created_at: now,
    });
    await route.fulfill({ status: 202, json: { message_id: `msg_${round}`, run_id: `run_${round}`, status: "applied" } });
  });

  await page.goto(`/zh/meal-plans/${planId}`);
  const dayOne = page.locator("#plan-day-1");
  const dayTwo = page.locator("#plan-day-2");
  const input = page.getByRole("textbox", { name: "输入菜单修改" });
  const send = page.getByRole("button", { name: "发送修改", exact: true });
  await expect(dayTwo.getByRole("heading", { name: "清蒸鱼" })).toBeVisible();
  await input.fill("第二天换成香菇鸡肉");
  await send.click();
  await expect(dayTwo.getByRole("heading", { name: "香菇鸡肉" })).toBeVisible();
  await expect(dayOne.getByRole("heading", { name: "番茄炒蛋" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "鸡肉", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "鱼", exact: true })).toHaveCount(0);

  rejectNext = true;
  await input.fill("第二天少放盐");
  await send.click();
  await expect(page.getByText("服务暂时不可用，请稍后重试")).toBeVisible();
  await expect(input).toHaveValue("第二天少放盐");
  await expect(dayTwo.getByRole("heading", { name: "香菇鸡肉" })).toBeVisible();

  await page.getByRole("button", { name: "恢复上一版", exact: true }).click();
  await send.click();
  await expect(dayTwo.getByRole("heading", { name: "清蒸鱼" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "鱼", exact: true })).toBeVisible();
  await expect(input).toHaveValue("");
  await expectMainVisible(page);
  await finish();
});
