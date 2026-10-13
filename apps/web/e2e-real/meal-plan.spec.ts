import { expect, test } from "@playwright/test";
import type { MealPlanConversation, MealPlanStatusResponse, RecipePost } from "../src/types/forkfit";
import { registerTestUser } from "../e2e/support/auth";
import { expectMainVisible, watchPage } from "../e2e/support/diagnostics";

test("真实模型：口味提取、规划完成、锁定、局部调整、澄清和撤销", async ({ page }, testInfo) => {
  test.setTimeout(1_800_000);
  const finish = watchPage(page, testInfo);
  await registerTestUser(page, testInfo);
  const api = "/api/backend";
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "csrf_token")!.value;
  const headers = { "X-CSRF-Token": csrf };
  const postsResponse = await page.request.get(`${api}/posts?limit=30`);
  expect(postsResponse.ok()).toBeTruthy();
  const posts = await postsResponse.json() as RecipePost[];
  expect(posts.length).toBeGreaterThanOrEqual(3);
  // Use stable real catalogue entries, including a recipe that actually contains cilantro.
  for (const id of ["budget-family-hotpot", "air-fryer-salmon-potato-box", "chickpea-cauliflower-tray"]) {
    await page.goto(`/zh/packs/${id}`);
    await page.getByRole("button", { name: "加入我的计划", exact: true }).click();
    await expect(page.getByRole("button", { name: "已加入我的计划", exact: true })).toBeVisible();
  }
  const history = await page.request.post(`${api}/posts/${posts[0].id}/save`, { headers });
  expect(history.ok()).toBeTruthy();
  const started = Date.now();
  const preferences = await page.request.post(`${api}/users/me/extract-preferences`, { headers, data: { locale: "zh" }, timeout: 120_000 });
  expect(preferences.status(), await preferences.text()).toBe(200);
  expect((await preferences.json()).preferences.extracted).toBe(true);

  await page.goto("/zh/meal-plans/new");
  await page.getByLabel("口味与限制（选填）").fill("三天家常菜，不要香菜");
  await page.getByRole("button", { name: "生成菜单" }).click();
  await expect(page).toHaveURL(/\/meal-plans\/plan_/);
  const planId = new URL(page.url()).pathname.split("/").pop()!;
  async function readPlan() {
    const response = await page.request.get(`${api}/meal-plans/${planId}`);
    expect(response.ok()).toBeTruthy();
    return await response.json() as MealPlanStatusResponse;
  }
  let plan: MealPlanStatusResponse;
  await expect.poll(async () => {
    plan = await readPlan();
    return plan.status;
  }, { timeout: 480_000, intervals: [2000, 4000, 6000] }).not.toMatch(/^(queued|running)$/);
  plan = await readPlan();
  console.log(`Initial plan ${planId}: ${plan.status}, ${Math.round((Date.now() - started) / 1000)}s`);
  await testInfo.attach("real-initial-plan", { body: JSON.stringify({ elapsed_ms: Date.now() - started, plan }, null, 2), contentType: "application/json" });
  expect(plan.status, JSON.stringify(plan.error)).toBe("succeeded");
  expect(plan.result!.days).toHaveLength(3);
  const original = structuredClone(plan.result!);
  expect(original.days.every((day) => day.dishes.length > 0)).toBe(true);
  expect(original.days.flatMap((day) => day.dishes.flatMap((dish) => dish.meal.ingredients)).join(" ")).not.toContain("香菜");
  await expect(page.getByRole("heading", { name: original.title, exact: true })).toBeVisible();

  const input = page.getByRole("textbox", { name: "输入菜单修改" });
  async function waitForMessage(id: string) {
    let conversation: MealPlanConversation;
    await expect.poll(async () => {
      const result = await page.request.get(`${api}/meal-plans/${planId}/conversation`);
      expect(result.ok()).toBeTruthy();
      conversation = await result.json();
      return conversation.messages.find((message) => message.message_id === id)?.status ?? "queued";
    }, { timeout: 480_000, intervals: [1500, 3000] }).not.toMatch(/^(queued|processing)$/);
    await testInfo.attach(`real-message-${id}`, { body: JSON.stringify(conversation!, null, 2), contentType: "application/json" });
    const message = conversation!.messages.find((message) => message.message_id === id)!;
    console.log(`Message ${JSON.stringify(message.content)}: ${message.status}, ${JSON.stringify(message.error ?? message.response)}`);
    return message;
  }
  async function send(text: string) {
    const response = page.waitForResponse((res) => res.request().method() === "POST" && res.url().endsWith(`/meal-plans/${planId}/conversation/messages`));
    await input.fill(text);
    await page.getByRole("button", { name: "发送修改", exact: true }).click();
    const created = await response;
    expect(created.ok(), await created.text()).toBeTruthy();
    const { message_id: id } = await created.json();
    return waitForMessage(id);
  }
  async function confirm(id: string) {
    const response = page.waitForResponse((res) => res.request().method() === "POST" && res.url().endsWith(`/messages/${id}/confirm`));
    await page.getByRole("button", { name: "确认调整", exact: true }).click();
    expect((await response).ok()).toBeTruthy();
    return waitForMessage(id);
  }
  expect((await send("锁定第一天")).status).toBe("applied");
  await expect(page.getByText("已锁定第 1 天", { exact: true })).toBeVisible();
  const beforeEdit = await readPlan();
  const changed = await send("第二天少放盐");
  expect(changed.status, JSON.stringify(changed.error)).toBe("applied");
  const afterEdit = await readPlan();
  expect(afterEdit.current_version_id).not.toBe(beforeEdit.current_version_id);
  expect(afterEdit.result!.days[0]).toEqual(beforeEdit.result!.days[0]);
  expect(afterEdit.result!.days[2]).toEqual(beforeEdit.result!.days[2]);
  expect(afterEdit.result!.days[1]).not.toEqual(beforeEdit.result!.days[1]);
  expect((await send("感觉不太对")).status).toBe("needs_clarification");
  expect((await readPlan()).current_version_id).toBe(afterEdit.current_version_id);
  expect((await send("恢复上一版")).status).toBe("applied");
  expect((await readPlan()).result).toEqual(beforeEdit.result);
  expect((await send("取消第一天锁定")).status).toBe("applied");
  expect((await readPlan()).locked_days).not.toContain(1);
  expect((await send("恢复上一版")).status).toBe("applied");
  expect((await readPlan()).locked_days).toContain(1);

  const beforeCancel = await readPlan();
  const pending = await send("第一天少放盐");
  expect(pending.status).toBe("needs_confirmation");
  const cancelResponse = page.waitForResponse((res) => res.request().method() === "POST" && res.url().endsWith(`/messages/${pending.message_id}/cancel`));
  await page.getByRole("button", { name: "取消这次修改", exact: true }).click();
  expect((await cancelResponse).ok()).toBeTruthy();
  await expect(page.getByRole("button", { name: "取消这次修改", exact: true })).toHaveCount(0);
  expect((await readPlan()).current_version_id).toBe(beforeCancel.current_version_id);

  const lockedTool = beforeCancel.result!.days[0].dishes[0].meal.equipment[0];
  expect(lockedTool).toBeTruthy();
  const conflict = await send(`整份菜单都不要用${lockedTool}，保留已锁定的第一天`);
  expect(conflict.status).toBe("needs_confirmation");
  const question = await confirm(conflict.message_id);
  expect(question.status, JSON.stringify(question.error)).toBe("needs_clarification");
  expect((await readPlan()).current_version_id).toBe(beforeCancel.current_version_id);
  await expect(page.getByRole("log")).toContainText(/锁定|解锁/);

  expect((await send("取消第一天锁定")).status).toBe("applied");
  await expect(page.getByText("已锁定第 1 天", { exact: true })).toHaveCount(0);
  const beforeGlobal = await readPlan();
  const global = await send("整份菜单都少放盐");
  expect(global.status).toBe("needs_confirmation");
  expect((await readPlan()).current_version_id).toBe(beforeGlobal.current_version_id);
  const applied = await confirm(global.message_id);
  expect(applied.status, JSON.stringify(applied.error ?? applied.response)).toBe("applied");
  const afterGlobal = await readPlan();
  expect(afterGlobal.current_version_id).not.toBe(beforeGlobal.current_version_id);
  expect(afterGlobal.result!.days).not.toEqual(beforeGlobal.result!.days);
  expect(afterGlobal.result!.days.flatMap((day) => day.dishes.flatMap((dish) => dish.meal.ingredients)).join(" ")).not.toContain("香菜");
  expect((await send("恢复上一版")).status).toBe("applied");
  expect((await readPlan()).result).toEqual(beforeGlobal.result);
  await page.reload();
  await expect(page.getByRole("heading", { name: original.title, exact: true })).toBeVisible();
  await expectMainVisible(page);
  await page.screenshot({ path: testInfo.outputPath("real-conversation-completed.png"), fullPage: true });
  await finish();
});
