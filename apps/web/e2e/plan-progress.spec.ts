import { expect, test } from "@playwright/test";
import type { MealPlanConversation, MealPlanStatusResponse } from "../src/types/forkfit";
import { registerTestUser } from "./support/auth";

test("规划显示真实阶段，断线不误报失败，追问区分排队和处理", async ({ page }, testInfo) => {
  await registerTestUser(page, testInfo);
  const id = "plan_progress_e2e";
  const now = new Date().toISOString();
  const plan: MealPlanStatusResponse = {
    plan_id: id, user_id: "e2e", status: "queued", mode: "team",
    stage: "starting", progress: 0, workflow_version: "meal-plan-v4.1",
    created_at: now, started_at: null, finished_at: null, result: null, error: null,
    current_version_id: null,
  };
  const conversation: MealPlanConversation = { plan_id: id, current_version_id: null, messages: [] };
  let disconnected = false;
  let conversationDisconnected = false;
  await page.route(`**/api/backend/meal-plans/${id}`, (route) => route.fulfill(disconnected
    ? { status: 503, json: { detail: "temporary unavailable" } }
    : { json: plan }));
  await page.route(`**/api/backend/meal-plans/${id}/conversation`, (route) => route.fulfill(conversationDisconnected
    ? { status: 503, json: { detail: "temporary unavailable" } }
    : { json: conversation }));
  await page.goto(`/zh/meal-plans/${id}`);
  await expect(page.getByRole("status")).toContainText("已提交，等待开始");
  await expect(page.getByText(/可以先离开/)).toBeVisible();
  await expect(page.getByText(/^\d+%$/)).toHaveCount(0);

  plan.status = "running";
  for (const [stage, label] of [
    ["adapting_recipes", "按你的要求调整菜谱"],
    ["reviewing_combinations", "审核菜单的搭配和可执行性"],
    ["revising_combination", "修正审核发现的问题"],
    ["finalizing", "整理菜单和清单"],
    ["future_stage", "正在处理你的规划"],
  ]) {
    plan.stage = stage;
    await expect(page.getByRole("status")).toContainText(label);
    await expect(page.getByText(/^\d+%$/)).toHaveCount(0);
  }

  disconnected = true;
  await expect(page.getByRole("status")).toContainText("暂时无法更新进度，不代表规划失败");
  await expect(page.getByRole("heading", { name: "正在准备你的菜单" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "这次没有规划成功" })).toHaveCount(0);
  disconnected = false;
  plan.stage = "reviewing_combinations";
  await expect(page.getByRole("status")).toContainText("审核菜单的搭配和可执行性");
  await page.screenshot({ path: testInfo.outputPath("planning-stage.png"), fullPage: true });

  plan.status = "needs_input";
  plan.error = { message: "可以使用哪些厨具？" };
  await expect(page.getByRole("heading", { name: "确认一下，再安排菜单" })).toBeVisible();
  await expect(page.getByText("可以使用哪些厨具？", { exact: true })).toBeVisible();
  await page.route(`**/api/backend/meal-plans/${id}/conversation/messages`, async (route) => {
    const body = route.request().postDataJSON();
    conversation.pending_message_id = "answer";
    conversation.messages.push({
      message_id: "answer", plan_id: id, role: "user", content: body.text,
      intent: "initial_planning", status: "queued", created_at: now,
    });
    await route.fulfill({ json: { message_id: "answer", run_id: "answer", status: "queued" } });
  });
  await page.getByRole("textbox", { name: "输入菜单修改" }).fill("只有炒锅");
  const send = page.getByRole("button", { name: "发送修改" });
  await send.click();
  await expect(page.getByRole("status")).toContainText("已收到，排队等待处理");
  await expect(send).toBeDisabled();
  conversation.messages[0].status = "processing";
  await expect(page.getByRole("status")).toContainText("正在处理你的要求");
  conversationDisconnected = true;
  await expect(page.getByRole("region", { name: "继续调整菜单" }).getByRole("alert")).toContainText("任务是否完成尚未确认");
  await expect(page.getByRole("status")).toHaveCount(0);
  conversationDisconnected = false;
  conversation.messages[0].status = "needs_clarification";
  conversation.messages.push({
    message_id: "question", plan_id: id, role: "assistant", content: "可以改成清炒吗？",
    intent: "initial_planning", status: "needs_clarification", created_at: now,
  });
  await expect(page.getByText("可以改成清炒吗？", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "输入菜单修改" }).fill("可以");
  await expect(send).toBeEnabled();
  await expect(page.getByRole("status")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("progress-clarification.png"), fullPage: true });
});
