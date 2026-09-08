import { expect, test } from "@playwright/test";

test("发现页脚本未就绪时不能丢失筛选操作", async ({ page }) => {
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => { releaseScripts = resolve; });
  await page.route("**/_next/**/*.js", async (route) => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto("/zh/discover", { waitUntil: "commit" });
    const category = page.getByRole("button", { name: "家常", exact: true });
    const search = page.getByRole("textbox", { name: "搜索菜谱...", exact: true });
    await expect(category).toBeVisible();
    await expect(category).toBeDisabled();
    await expect(search).toBeDisabled();
    releaseScripts();
    await expect(category).toBeEnabled();
    await expect(search).toBeEnabled();
    await category.click();
    await expect(page).toHaveURL(/category=/);
    await expect(category).toHaveAttribute("data-active", "true");
  } finally {
    releaseScripts();
    await page.unrouteAll({ behavior: "wait" });
  }
});
