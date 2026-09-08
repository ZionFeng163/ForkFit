import { expect, test } from "@playwright/test";
import type { MealPlanConversation, MealPlanStatusResponse, RecipePost } from "../src/types/forkfit";
import { registerTestUser } from "../e2e/support/auth";
import { expectMainVisible, watchPage } from "../e2e/support/diagnostics";

test("真实模型：口味提取、规划完成、锁定、局部调整、澄清和撤销", async ({ page }, testInfo) => {
  const finish = watchPage(page, testInfo);
  await registerTestUser(page, testInfo);
  const api = "/api/backend";
  const csrf = (await page.context().cookies()).find((cookie) => cookie.name === "csrf_token")!.value;
  const headers = { "X-CSRF-Token": csrf };
  const postsResponse = await page.request.get(`${api}/posts?limit=30`);
  expect(postsResponse.ok()).toBeTruthy();
  const posts = await postsResponse.json() as RecipePost[];
  expect(posts.length).toBeGreaterThanOrEqual(3);
  // Keep the real catalogue and select using the same UI users operate.
  for (let i = 0; i < 3; i += 1) {
    await page.getByRole("button", { name: "加入计划", exact: true }).first().click();
  }
  const history = await page.request.post(`${api}/posts/${posts[0].id}/save`, { headers });
  expect(history.ok()).toBeTruthy();
  const started = Date.now();
  const preferences = await page.request.post(`${api}/users/me/extract-preferences`, { headers, data: { locale: "zh" }, timeout: 120_000 });
  expect(preferences.status(), await preferences.text()).toBe(200);
  expect((await preferences.json()).preferences.extracted).toBe(true);

  await page.goto("/zh/meal-plans/new");
  await page.getByLabel("这几天有什么讲究").fill("三天家常菜，不要香菜");
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
  await testInfo.attach("real-initial-plan", { body: JSON.stringify({ elapsed_ms: Date.now() - started, plan }, null, 2), contentType: "application/json" });
  expect(plan.status, JSON.stringify(plan.error)).toBe("succeeded");
  expect(plan.result!.days).toHaveLength(3);
  const original = structuredClone(plan.result!);
  expect(original.days.every((day) => day.dishes.length > 0)).toBe(true);
  expect(original.days.flatMap((day) => day.dishes.flatMap((dish) => dish.meal.ingredients)).join(" ")).not.toContain("香菜");
  await expect(page.getByRole("heading", { name: original.title, exact: true })).toBeVisible();

  const input = page.getByRole("textbox", { name: "输入菜单修改" });
  async function send(text: string) {
    const response = page.waitForResponse((res) => res.request().method() === "POST" && res.url().endsWith(`/meal-plans/${planId}/conversation/messages`));
    await input.fill(text);
    await page.getByRole("button", { name: "发送修改", exact: true }).click();
    const created = await response;
    expect(created.ok(), await created.text()).toBeTruthy();
    const { message_id: id } = await created.json();
    let conversation: MealPlanConversation;
    await expect.poll(async () => {
      const result = await page.request.get(`${api}/meal-plans/${planId}/conversation`);
      expect(result.ok()).toBeTruthy();
      conversation = await result.json();
      return conversation.messages.find((message) => message.message_id === id)?.status ?? "queued";
    }, { timeout: 300_000, intervals: [1500, 3000] }).not.toMatch(/^(queued|processing)$/);
    await testInfo.attach(`real-message-${id}`, { body: JSON.stringify(conversation!, null, 2), contentType: "application/json" });
    return conversation!.messages.find((message) => message.message_id === id)!;
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
  await page.reload();
  await expect(page.getByRole("heading", { name: original.title, exact: true })).toBeVisible();
  await expectMainVisible(page);
  await finish();
});
