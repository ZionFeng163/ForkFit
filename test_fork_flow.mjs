import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/en';

(async () => {
  const browser = await chromium.launch({ headless: false, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[page error] ${err.message}`));

  // 1. Home page - find a pack
  console.log('=== 1. Loading home page ===');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
  await page.screenshot({ path: 'fork_01_home.png', fullPage: true });
  console.log(`URL: ${page.url()}`);

  // 2. Click on first pack link
  console.log('\n=== 2. Navigate to pack detail ===');
  const packLink = page.locator('a[href*="/packs/"]').first();
  await packLink.waitFor({ timeout: 10000 });
  const packHref = await packLink.getAttribute('href');
  console.log(`Found pack link: ${packHref}`);
  await packLink.click();
  await page.waitForLoadState('networkidle', { timeout: 10000 });
  await page.screenshot({ path: 'fork_02_pack_detail.png', fullPage: true });
  console.log(`URL: ${page.url()}`);

  // 3. Click the fork button
  console.log('\n=== 3. Click fork button ===');
  const forkLink = page.locator('a[href*="/fork"], button:has-text("Fork"), button:has-text("fork")').first();
  await forkLink.waitFor({ timeout: 5000 });
  await forkLink.click();
  await page.waitForLoadState('networkidle', { timeout: 10000 });
  await page.screenshot({ path: 'fork_03_fork_form.png', fullPage: true });
  console.log(`URL: ${page.url()}`);

  // 4. Fill in the fork form
  console.log('\n=== 4. Fill fork form ===');
  const fill = async (id, value) => {
    const el = page.locator(`#${id}`);
    if (await el.isVisible({ timeout: 3000 })) {
      await el.fill(value);
      console.log(`  Filled ${id}: ${value}`);
    }
  };

  await fill('people_count', '2');
  await fill('budget', '50');
  await fill('likes', 'chicken, rice, vegetables');
  await fill('dislikes', 'seafood');
  await fill('allergies', 'peanuts');
  await fill('diet_rules', 'no pork');
  await fill('equipment', 'oven, stove');
  await fill('max_cook_time_minutes', '30');
  await fill('soft_preferences', 'quick meals');

  await page.screenshot({ path: 'fork_04_form_filled.png', fullPage: true });

  // 5. Submit the form
  console.log('\n=== 5. Submit fork ===');
  const submitBtn = page.locator('button[type="submit"]');
  await submitBtn.click();

  // Wait for navigation to run result page
  console.log('Waiting for run result...');
  await page.waitForURL('**/runs/**', { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.screenshot({ path: 'fork_05_run_result.png', fullPage: true });
  console.log(`Run result URL: ${page.url()}`);

  // Wait a bit more for the result to potentially load
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'fork_06_run_final.png', fullPage: true });

  // Report
  console.log('\n=== Console errors ===');
  if (errors.length === 0) {
    console.log('No console errors');
  } else {
    errors.forEach(e => console.log(e));
  }

  console.log('\nFork flow test complete!');
  await browser.close();
})();
