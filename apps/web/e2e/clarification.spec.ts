import { expect, test } from "@playwright/test";

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
