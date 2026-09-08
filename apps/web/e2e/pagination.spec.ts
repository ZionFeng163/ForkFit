import { expect, test } from "@playwright/test";
import type { RecipePost } from "../src/types/forkfit";
import { expectMainVisible, watchPage } from "./support/diagnostics";

test("受控 API：加载第二页保留顺序、无重复、末页停止加载", async ({ page }, testInfo) => {
  const finish = watchPage(page, testInfo);
  const response = await page.request.get("/api/backend/posts?limit=1");
  expect(response.ok()).toBeTruthy();
  const [seed] = await response.json() as RecipePost[];
  expect(seed).toBeTruthy();
  const recipes = Array.from({ length: 20 }, (_, index) => ({
    ...seed, id: `pagination_${index}`, title: `分页菜谱 ${index + 1}`,
  }));
  const offsets: number[] = [];
  await page.route("**/api/backend/posts?*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get("offset") ?? 0);
    offsets.push(offset);
    await route.fulfill({ json: recipes.slice(offset, offset + 18), headers: { "X-Total-Count": "20" } });
  });
  await page.goto("/zh/discover");
  await page.getByRole("button", { name: "家常", exact: true }).click();
  const cards = page.locator("article").filter({ has: page.getByRole("button", { name: /加入计划|已加入/ }) });
  await expect(cards).toHaveCount(18);
  const recipeIds = () => cards.evaluateAll((items) => items.map((item) => item.querySelector("a[href*='/packs/']")?.getAttribute("href")));
  const before = await recipeIds();
  await page.getByRole("button", { name: "加载更多", exact: true }).click();
  await expect(cards).toHaveCount(20);
  const after = await recipeIds();
  expect(after.slice(0, before.length)).toEqual(before);
  expect(new Set(after).size).toBe(after.length);
  expect(offsets).toEqual([0, 18]);
  await expect(page.getByRole("button", { name: "加载更多", exact: true })).toHaveCount(0);
  await expectMainVisible(page);
  await finish();
});
