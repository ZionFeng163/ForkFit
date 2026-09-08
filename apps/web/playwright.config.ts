import { defineConfig, devices } from "@playwright/test";

const production = process.env.E2E_TARGET === "production";
const real = process.env.E2E_REAL === "1";
const baseURL = process.env.E2E_BASE_URL ?? (production ? "https://forkfit.shop" : "http://127.0.0.1:33001");
const target = new URL(baseURL);
if (!production && target.origin !== "http://127.0.0.1:33001") {
  throw new Error("Write acceptance tests must use the isolated http://127.0.0.1:33001 stack.");
}

export default defineConfig({
  testDir: real && !production ? "./e2e-real" : "./e2e",
  // Remote runs cannot select account/content mutation or mocked UI suites.
  testMatch: production ? "public.spec.ts" : "**/*.spec.ts",
  outputDir: "./test-results",
  fullyParallel: false,
  forbidOnly: true,
  failOnFlakyTests: true,
  retries: production || real ? 0 : 1,
  workers: 1,
  reporter: [["line"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  expect: { timeout: 10_000 },
  timeout: real ? 900_000 : production ? 120_000 : 60_000,
  use: {
    baseURL,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
  },
  projects: real && !production
    ? [{ name: "real-desktop", use: { ...devices["Desktop Chrome"] } }]
    : production
    ? [{ name: "production", use: { ...devices["Desktop Chrome"] } }]
    : [
        { name: "desktop", use: { ...devices["Desktop Chrome"] } },
        { name: "tablet", use: { ...devices["iPad Pro 11"], browserName: "chromium" } },
        { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
      ],
});
