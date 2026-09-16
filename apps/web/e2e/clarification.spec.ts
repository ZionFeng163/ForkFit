import { expect, test } from "@playwright/test";
import type { MealPlanConversation, MealPlanStatusResponse } from "../src/types/forkfit";

test("单菜冲突通过聊天回答，回复失败不丢输入", async ({ page }) => {
  await page.goto("/zh/login");
  await page.getByPlaceholder("请输入邮箱或用户名").fill("admin");
  await page.getByPlaceholder("请输入密码").fill("ForkFit_E2E_Admin_2026!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  let resumed = false;
  let fail = true;
  await page.route("**/api/backend/runs", (route) => route.fulfill({ status: 201, json: { run_id: "clarify_ui", status: "queued" } }));
  await page.route("**/api/backend/runs/clarify_ui", (route) => route.fulfill({ json: {
    run_id: "clarify_ui", status: "needs_input", unresolved_payload: {
      message: resumed ? "炒锅无法完成原做法。原菜谱保持不变，能接受清炒吗？" : "这道菜需要烤箱。原菜谱保持不变，你可以使用哪些厨具？",
    },
  } }));
  await page.route("**/api/backend/runs/clarify_ui/resume", async (route) => {
    expect(route.request().postDataJSON()).toEqual({ request_text: "只有炒锅" });
    if (fail) { fail = false; await route.fulfill({ status: 503, json: { detail: "temporary unavailable" } }); return; }
    resumed = true;
    await route.fulfill({ json: { run_id: "clarify_ui", status: "queued" } });
  });
  await page.goto("/zh/packs/budget-family-hotpot/fork");
  await page.getByPlaceholder("例如：少盐、30 分钟内、多加蔬菜").fill("不要用烤箱");
  await page.getByRole("button", { name: "开始定制", exact: true }).click();
  await expect(page.getByText("这道菜需要烤箱。原菜谱保持不变，你可以使用哪些厨具？")).toBeVisible();
  const answer = page.getByRole("textbox", { name: "回复定制问题" });
  await answer.fill("只有炒锅");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByText("服务暂时不可用，请稍后重试")).toBeVisible();
  await expect(answer).toHaveValue("只有炒锅");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByText("炒锅无法完成原做法。原菜谱保持不变，能接受清炒吗？")).toBeVisible();
  await expect(page.getByText("只有炒锅", { exact: true })).toBeVisible();
});

test("首次规划可回答问题，刷新保留对话并继续生成菜单", async ({ page }) => {
  await page.goto("/zh/login");
  await page.getByPlaceholder("请输入邮箱或用户名").fill("admin");
  await page.getByPlaceholder("请输入密码").fill("ForkFit_E2E_Admin_2026!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  const id = "initial_clarification_ui";
  const now = new Date().toISOString();
  const plan: MealPlanStatusResponse = {
    plan_id: id, user_id: "e2e", status: "needs_input", mode: "team", stage: "needs_input",
    progress: 30, workflow_version: "meal-plan-v4.1", created_at: now, started_at: now, finished_at: now,
    error: { message: "你可以使用哪些厨具？" }, result: null, current_version_id: null,
  };
  const conversation: MealPlanConversation = { plan_id: id, current_version_id: null, messages: [
    { message_id: "question", plan_id: id, role: "assistant", content: "你可以使用哪些厨具？", intent: "initial_planning", status: "needs_clarification", created_at: now },
  ] };
  await page.route(`**/api/backend/meal-plans/${id}`, (route) => route.fulfill({ json: plan }));
  await page.route(`**/api/backend/meal-plans/${id}/conversation`, (route) => route.fulfill({ json: conversation }));
  await page.route("**/api/backend/posts/ui_recipe", (route) => route.fulfill({ json: { image_urls: [] } }));
  let fail = true;
  await page.route(`**/api/backend/meal-plans/${id}/conversation/messages`, async (route) => {
    const body = route.request().postDataJSON();
    expect(body.base_version_id).toBeNull();
    if (fail) { fail = false; await route.fulfill({ status: 503, json: { detail: "temporary unavailable" } }); return; }
    conversation.messages.push({ message_id: "answer", plan_id: id, role: "user", content: body.text, intent: "initial_planning", status: "needs_clarification", created_at: now });
    if (body.text === "只有炒锅") {
      conversation.messages.push({ message_id: "question2", plan_id: id, role: "assistant", content: "可以改成清炒吗？", intent: "initial_planning", status: "needs_clarification", created_at: now });
    } else {
      plan.status = "succeeded";
      plan.current_version_id = "version1";
      conversation.current_version_id = "version1";
      plan.result = { title: "你的家常菜单", summary: "", mode: "team", workflow_version: "meal-plan-v4.1", days: [{ day_index: 1, label: "第 1 天", reason: "", dishes: [{ source_post_id: "ui_recipe", reason: "", meal: { id: "recipe", day: "", name: "清炒青菜", ingredients: ["青菜 200 克"], steps: ["洗净后炒熟。"], equipment: ["炒锅"], cook_time_minutes: 15, tags: [], notes: "", difficulty: "easy" } }] }], shopping_list: [], prep_notes: [], decision_summary: "", agent_reports: [] };
    }
    await route.fulfill({ json: { message_id: "answer", run_id: "answer", status: "queued" } });
  });
  await page.goto(`/zh/meal-plans/${id}`);
  await expect(page.getByText("你可以使用哪些厨具？", { exact: true })).toBeVisible();
  const input = page.getByRole("textbox", { name: "输入菜单修改" });
  await input.fill("只有炒锅");
  await page.getByRole("button", { name: "发送修改" }).click();
  await expect(page.getByText("服务暂时不可用，请稍后重试")).toBeVisible();
  await expect(input).toHaveValue("只有炒锅");
  await page.getByRole("button", { name: "发送修改" }).click();
  await expect(page.getByText("可以改成清炒吗？", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("只有炒锅", { exact: true })).toBeVisible();
  await input.fill("可以清炒");
  await page.getByRole("button", { name: "发送修改" }).click();
  await expect(page.getByRole("heading", { name: "你的家常菜单" })).toBeVisible();
});
