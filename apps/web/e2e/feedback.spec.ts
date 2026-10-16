import { expect, test } from "@playwright/test";
import { registerTestUser } from "./support/auth";
import { expectMainVisible } from "./support/diagnostics";

test("私密反馈提交、失败重试、后台回复与处理状态", async ({ page, browser }, testInfo) => {
  await registerTestUser(page, testInfo);
  await page.goto("/zh/help#feedback");
  await page.getByLabel("反馈类型").selectOption("data_request");
  const content = `验收数据导出申请 ${Date.now()}-${testInfo.project.name}`;
  await page.getByLabel("具体内容").fill(content);
  await page.route("**/api/backend/feedback", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"detail":"Unavailable"}' }));
  await page.getByRole("button", { name: "提交反馈", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "服务暂时不可用" })).toBeVisible();
  await expect(page.getByLabel("具体内容")).toHaveValue(content);
  await page.unroute("**/api/backend/feedback");
  await page.getByRole("button", { name: "提交反馈", exact: true }).click();
  await expect(page.getByText("已提交，可在下方查看处理进度和回复。")).toBeVisible();
  const ownItem = page.locator("article").filter({ has: page.getByText(content, { exact: true }) }).last();
  await expect(ownItem.getByText("待处理", { exact: true })).toBeVisible();
  await expectMainVisible(page);
  await page.screenshot({ path: testInfo.outputPath("feedback-submitted.png"), fullPage: true });

  const adminContext = await browser.newContext({ baseURL: "http://127.0.0.1:33001", viewport: page.viewportSize() ?? undefined });
  try {
    const admin = await adminContext.newPage();
    await admin.goto("/zh/login?returnTo=%2Fadmin");
    await admin.getByPlaceholder("请输入邮箱或用户名").fill("admin");
    await admin.getByPlaceholder("请输入密码").fill("ForkFit_E2E_Admin_2026!");
    await admin.getByRole("button", { name: "登录", exact: true }).click();
    await expect(admin).toHaveURL(/\/zh\/admin$/);
    await admin.getByRole("button", { name: "用户反馈", exact: true }).first().click();
    const item = admin.locator("article").filter({ hasText: content });
    await item.getByLabel("回复用户").fill("已收到，将核实账号并处理申请。");
    await item.getByLabel("处理状态").selectOption("resolved");
    await item.getByRole("button", { name: "保存处理结果" }).click();
    await expect(item.locator("span").filter({ hasText: /^已处理$/ })).toBeVisible();
    await expectMainVisible(admin);
    await admin.screenshot({ path: testInfo.outputPath("feedback-admin.png"), fullPage: true });
  } finally {
    await adminContext.close();
  }
  await page.getByRole("button", { name: "刷新反馈" }).click();
  await expect(ownItem.getByText("已处理", { exact: true })).toBeVisible();
  await expect(ownItem.getByText("管理员回复：已收到，将核实账号并处理申请。")).toBeVisible();
});
