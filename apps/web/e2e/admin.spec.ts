import { expect, test } from "@playwright/test";

import { expectMainVisible, watchPage } from "./support/diagnostics";

test.describe("后台", () => {
  test("管理员可查看各模块且布局不溢出", async ({ page }, testInfo) => {
    test.skip(process.env.E2E_TARGET === "production", "Production admin credentials are never stored in the test suite.");
    const finish = watchPage(page, testInfo, [/\/api\/backend\/auth\/me$/]);
    await page.goto("/zh/login?returnTo=%2Fadmin");
    await page.getByPlaceholder("请输入邮箱或用户名").fill("admin");
    await page.getByPlaceholder("请输入密码").fill("ForkFit_E2E_Admin_2026!");
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page).toHaveURL(/\/zh\/admin$/);
    await expect(page.getByRole("heading", { name: "数据看板" })).toBeVisible();

    for (const tab of ["服务状态", "内容管理", "用户管理", "数据看板"]) {
      await page.getByRole("button", { name: tab, exact: true }).first().click();
      await expect(page.getByRole("heading", { name: tab })).toBeVisible();
      await expectMainVisible(page);
    }
    await finish();
  });
});
