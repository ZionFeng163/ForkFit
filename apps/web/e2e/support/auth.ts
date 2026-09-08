import { expect, type Page, type TestInfo } from "@playwright/test";

export async function registerTestUser(page: Page, testInfo: TestInfo) {
  const suffix = `${Date.now()}${testInfo.workerIndex}`;
  const username = `e2e_${suffix}`;
  const password = `ForkFit_${suffix}!`;

  await page.goto("/zh/register?returnTo=%2Fdiscover");
  await page.getByPlaceholder("给自己起个名字").fill("自动验收用户");
  await page.getByPlaceholder(/3-60 个字符/).fill(username);
  await page.getByPlaceholder("至少 6 位").fill(password);
  await page.getByPlaceholder("再次输入密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/zh\/discover$/);

  return { username, password };
}
