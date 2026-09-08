import { expect, test } from "@playwright/test";

import { registerTestUser } from "./support/auth";
import { expectMainVisible, watchPage } from "./support/diagnostics";

test("注册、退出、错误登录和正确登录", async ({ page }, testInfo) => {
  const finish = watchPage(page, testInfo, [
    /\/api\/backend\/auth\/me$/,
    /\/api\/backend\/auth\/login$/,
  ]);
  const { username, password } = await registerTestUser(page, testInfo);
  await expect(page.getByRole("link", { name: "个人中心" })).toBeVisible();

  await page.getByRole("link", { name: "个人中心" }).click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/zh\/login$/);
  await page.getByPlaceholder("请输入邮箱或用户名").fill(username);
  await page.getByPlaceholder("请输入密码").fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText(/用户名或密码|登录失败/)).toBeVisible();

  await page.getByPlaceholder("请输入密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/zh(?:\/discover)?$/);
  await expectMainVisible(page);
  await finish();
});
