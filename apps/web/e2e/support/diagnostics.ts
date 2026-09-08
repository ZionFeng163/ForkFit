import { expect, type Page, type TestInfo } from "@playwright/test";

const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /Failed to load resource.*the server responded with a status of 404/i,
  // HTTP responses are checked below with their URL, which is more precise than
  // Chromium's generic resource error message. Network failures are likewise
  // checked by requestfailed, where same-origin requests can be identified.
  /Failed to load resource.*the server responded with a status of \d{3}/i,
  /Failed to load resource: net::ERR_/i,
];

export function watchPage(
  page: Page,
  testInfo: TestInfo,
  allowedHttpErrors: RegExp[] = [/\/api\/backend\/auth\/me$/],
) {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (!IGNORED_CONSOLE.some((pattern) => pattern.test(text))) {
      errors.push(`console.error: ${text}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(page.url() || "http://localhost").origin) {
      const reason = request.failure()?.errorText ?? "unknown";
      if (!/ERR_ABORTED|NS_BINDING_ABORTED/.test(reason)) {
        errors.push(`requestfailed: ${request.method()} ${url.pathname} (${reason})`);
      }
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    const current = page.url();
    const status = response.status();
    const isUnexpected = status >= 500 || status === 401 || status === 403;
    const isAllowed = allowedHttpErrors.some((pattern) => pattern.test(url.pathname));
    if (current && url.origin === new URL(current).origin && isUnexpected && !isAllowed) {
      errors.push(`http ${response.status()}: ${response.request().method()} ${url.pathname}`);
    }
  });

  return async () => {
    if (errors.length) {
      await testInfo.attach("browser-errors", {
        body: errors.join("\n"),
        contentType: "text/plain",
      });
    }
    expect(errors, "页面存在未处理异常、控制台错误或同源 5xx").toEqual([]);
  };
}

export async function expectHealthyLayout(page: Page) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const viewportWidth = root.clientWidth;
    const overflowing = Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .filter((element) => {
        const style = getComputedStyle(element);
        if (style.position === "fixed" || style.visibility === "hidden") return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 1 && (rect.left < -2 || rect.right > viewportWidth + 2);
      })
      .slice(0, 8)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
    return {
      viewportWidth,
      scrollWidth: root.scrollWidth,
      overflowing,
    };
  });

  expect(layout.scrollWidth, `页面横向溢出：${layout.overflowing.join(", ")}`).toBeLessThanOrEqual(
    layout.viewportWidth + 2,
  );
}

export async function expectMainVisible(page: Page) {
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Internal Server Error");
  await expect(page.locator("body")).not.toContainText("Application error");
  await expectHealthyLayout(page);
}
