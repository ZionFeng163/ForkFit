import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { MealPlanConversation, MealPlanStatusResponse } from "../src/types/forkfit";
import { expectHealthyLayout } from "./support/diagnostics";

const directory = "/tmp/forkfit-visual-review";
const sizes = [[1440, 900], [1024, 768], [768, 1024], [390, 844]];
async function capture(page: Page, name: string, width: number) {
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  await page.locator("img").evaluateAll(async (images) => {
    await Promise.all(images.filter((image): image is HTMLImageElement => image instanceof HTMLImageElement && image.getBoundingClientRect().top < innerHeight).map((image) => image.decode().catch(() => undefined)));
  });
  await expectHealthyLayout(page);
  await page.screenshot({ path: `${directory}/${name}-${width}.png`, fullPage: true });
}

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "desktop", "This suite explicitly checks its own viewport sizes.");
  await mkdir(directory, { recursive: true });
});

test("视觉：公开页面、中文断行和首页去重", async ({ page }) => {
  test.setTimeout(180_000);
  for (const [width, height] of [...sizes, [899, 900], [901, 900]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/zh", { waitUntil: "domcontentloaded" });
    const phrases = page.locator(".home-planner-copy h1 span");
    await expect(phrases).toHaveCount(2);
    for (const phrase of await phrases.all()) {
      const singleLine = await phrase.evaluate((element) => {
        const style = getComputedStyle(element);
        return element.getBoundingClientRect().height <= parseFloat(style.lineHeight) + 2;
      });
      expect(singleLine).toBe(true);
    }
    const ids = await page.locator("article").evaluateAll((cards) => cards.map((card) => card.querySelector("a")?.getAttribute("href")));
    expect(new Set(ids).size).toBe(ids.length);
    await expect(page.locator(".home-process")).toHaveCount(0);
    await capture(page, "home", width);
    if (width === 899 || width === 901) continue;
    await page.goto("/zh/discover", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("textbox", { name: /搜索菜谱/ })).toHaveCount(1);
    await capture(page, "discover", width);
    await page.locator("article a").first().click();
    await expect(page.getByRole("heading", { name: "制作步骤" })).toBeVisible();
    const gallery = await page.locator(".recipe-gallery").boundingBox();
    expect(gallery!.height).toBeLessThanOrEqual(361);
    await capture(page, "recipe", width);
    await page.goto("/zh/login", { waitUntil: "domcontentloaded" });
    await capture(page, "login", width);
  }
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  await capture(page, "home-en", 901);
});

test("视觉：已有测试账户、长菜单、对话与失败恢复", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/zh/login");
  await page.getByPlaceholder("请输入邮箱或用户名").fill("admin");
  await page.getByPlaceholder("请输入密码").fill("ForkFit_E2E_Admin_2026!");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  const id = "visual_plan";
  const now = new Date().toISOString();
  const plan: MealPlanStatusResponse = {
    plan_id: id, user_id: "visual", status: "succeeded", mode: "guided", stage: "completed",
    progress: 100, workflow_version: "meal-plan-v4", created_at: now, started_at: now, finished_at: now, error: null, current_version_id: "v1", locked_days: [1],
    result: {
      title: "工作日三天的家常菜单", summary: "保留第一天的安排。", mode: "guided", workflow_version: "meal-plan-v4",
      days: [1, 2, 3].map((day) => ({ day_index: day, label: `第 ${day} 天`, reason: "根据时间和口味安排。", dishes: [{
        source_post_id: "visual_recipe", reason: "食材可以在其他日期复用。", meal: {
          id: "visual_recipe", day: `第 ${day} 天`, name: "香菇西兰花胡萝卜鸡肉饭配清炒时蔬",
          ingredients: ["鸡肉 200 克", "西兰花 150 克", "香菇 3 朵", "胡萝卜半根", "米饭 2 碗"],
          steps: ["鸡肉切块，蔬菜洗净切小块，香菇切片，分别准备好。", "锅中加入少量油，将鸡肉炒至熟透，再加入蔬菜和香菇翻炒。", "加入少量水焖至食材熟透，搭配米饭装盘。"],
          equipment: ["炒锅"], cook_time_minutes: 25, tags: [], notes: "", difficulty: "easy",
        },
      }] })),
      shopping_list: Array.from({ length: 24 }, (_, i) => ({ name: `采购食材 ${i + 1}`, amount: "200 克", used_on: [1, 2, 3] })),
      prep_notes: ["蔬菜提前洗净，肉类单独保存。"], decision_summary: "优先复用食材。", agent_reports: [],
    },
  };
  const original = structuredClone(plan.result!);
  const conversation: MealPlanConversation = { plan_id: id, current_version_id: "v1", messages: Array.from({ length: 8 }, (_, i) => ({
    message_id: `m${i}`, plan_id: id, role: i % 2 ? "assistant" : "user", content: i % 2 ? "已保留你的要求并更新菜单。" : "第二天换一道更快的。", intent: "modify_day", status: "applied", created_at: now,
  })) };
  await page.route("**/api/backend/posts/visual_recipe", (route) => route.fulfill({ json: { image_urls: [] } }));
  await page.route(`**/api/backend/meal-plans/${id}`, (route) => route.fulfill({ json: plan }));
  await page.route(`**/api/backend/meal-plans/${id}/conversation`, (route) => route.fulfill({ json: conversation }));
  let reject = false;
  let version = 1;
  await page.route(`**/api/backend/meal-plans/${id}/conversation/messages`, async (route) => {
    if (reject) { reject = false; await route.fulfill({ status: 503, json: { detail: "temporarily unavailable" } }); return; }
    const body = route.request().postDataJSON();
    expect(body.base_version_id).toBe(plan.current_version_id);
    if (body.text === "恢复上一版") plan.result = structuredClone(original);
    else plan.result!.days[1].dishes[0].meal.name = "番茄炒蛋";
    plan.current_version_id = conversation.current_version_id = `v${++version}`;
    await route.fulfill({ status: 202, json: { message_id: `m${version}`, status: "applied" } });
  });
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const [name, route] of [["new-plan", "/meal-plans/new"], ["profile", "/profile"], ["post", "/posts/new"], ["admin", "/admin"], ["fork", "/packs/budget-family-hotpot/fork"], ["plan", `/meal-plans/${id}`]]) {
      await page.goto(`/zh${route}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      if (name === "plan") {
        await expect(page.getByRole("textbox", { name: "输入菜单修改" })).toBeVisible();
        expect(await page.locator(".conversation-history").getAttribute("open")).toBeNull();
        const history = page.locator(".conversation-history summary");
        await history.focus();
        await page.keyboard.press("Enter");
        await expect(page.locator(".conversation-history")).toHaveAttribute("open", "");
        await page.keyboard.press("Enter");
      }
      await capture(page, name, width);
    }
  }
  const input = page.getByRole("textbox", { name: "输入菜单修改" });
  const send = page.getByRole("button", { name: "发送修改", exact: true });
  await input.fill("第二天换成番茄炒蛋"); await send.click();
  await expect(page.locator("#plan-day-2 h2")).toHaveText("番茄炒蛋");
  reject = true;
  await input.fill("再少放一点盐"); await send.click();
  await expect(input).toHaveValue("再少放一点盐");
  await expect(page.getByText("服务暂时不可用，请稍后重试")).toBeVisible();
  await page.getByRole("button", { name: "恢复上一版", exact: true }).click(); await send.click();
  await expect(page.locator("#plan-day-2 h2")).toHaveText(original.days[1].dishes[0].meal.name);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  await capture(page, "plan-zoom200", 1440);
});
