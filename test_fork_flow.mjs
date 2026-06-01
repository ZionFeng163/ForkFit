import { chromium } from 'playwright';

const BASE = 'http://localhost:3000/en';
const API = 'http://localhost:8000';

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', err => errors.push(`[page error] ${err.message}`));

  // 0. Login
  console.log('=== 0. Login ===');
  const loginResp = await page.request.post(`${API}/auth/login`, {
    data: { username: 'admin', password: 'admin123456' },
  });
  const loginData = await loginResp.json();
  console.log(`  Logged in as: ${loginData.user.username}`);
  await context.addCookies([{
    name: 'access_token',
    value: loginData.access_token,
    domain: 'localhost',
    path: '/',
  }]);

  // 1. Home page
  console.log('\n=== 1. Home page ===');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });

  // 2. Pick a pack with ingredients that will trigger changes
  console.log('\n=== 2. Navigate to pack ===');
  const packLink = page.locator('a[href*="/packs/"]').first();
  await packLink.waitFor({ timeout: 10000 });
  const packHref = await packLink.getAttribute('href');
  console.log(`  Pack: ${packHref}`);
  await packLink.click();
  await page.waitForLoadState('networkidle', { timeout: 10000 });
  await page.screenshot({ path: 'final_01_pack.png', fullPage: true });

  // 3. Click fork
  console.log('\n=== 3. Fork form ===');
  const forkLink = page.locator('a[href*="/fork"], button:has-text("Fork"), button:has-text("fork")').first();
  await forkLink.waitFor({ timeout: 5000 });
  await forkLink.click();
  await page.waitForLoadState('networkidle', { timeout: 10000 });
  await page.screenshot({ path: 'final_02_form.png', fullPage: true });

  // 4. Fill form — trigger real changes
  console.log('\n=== 4. Fill form ===');
  const fill = async (id, value) => {
    const el = page.locator(`#${id}`);
    if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
      await el.fill(value);
    }
  };
  await fill('people_count', '2');
  await fill('budget', '40');
  await fill('likes', 'chicken, rice, spicy');
  await fill('dislikes', 'cilantro, raw fish');
  await fill('allergies', 'peanuts');
  await page.screenshot({ path: 'final_03_filled.png', fullPage: true });

  // 5. Submit
  console.log('\n=== 5. Submit ===');
  const submitBtn = page.locator('button[type="submit"]');
  const apiPromise = page.waitForResponse(
    resp => resp.url().includes('/runs') && resp.request().method() === 'POST',
    { timeout: 15000 }
  ).catch(() => null);
  await submitBtn.click();
  const apiResp = await apiPromise;
  if (apiResp) {
    const body = await apiResp.json().catch(() => null);
    console.log(`  API ${apiResp.status()}: run_id=${body?.run_id}`);
  }

  // 6. Wait for result
  try {
    await page.waitForURL('**/runs/**', { timeout: 10000 });
  } catch {
    console.log(`  Stuck on: ${page.url()}`);
  }

  if (page.url().includes('/runs/')) {
    const runId = page.url().split('/runs/')[1];
    console.log(`\n=== 6. Waiting for result (run: ${runId}) ===`);

    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(3000);
      try {
        const resp = await page.request.get(`${API}/runs/${runId}`, {
          headers: { Cookie: `access_token=${loginData.access_token}` },
        });
        const data = await resp.json();
        if (data.status === 'succeeded') {
          console.log(`  ✅ Succeeded after ${(i+1)*3}s`);
          console.log(`     Changes: ${data.result?.change_log?.length || 0}`);
          console.log(`     Steps: ${data.result?.forked_meal_pack?.meals?.[0]?.steps?.length || 0}`);
          console.log(`     LLM calls: ${data.trace?.llm_calls?.length || 0}`);
          console.log(`     Graph steps: ${data.trace?.steps?.length || 0}`);
          break;
        }
        if (data.status === 'failed') {
          console.log(`  ❌ Failed: ${data.error?.message}`);
          break;
        }
        if (i % 4 === 3) console.log(`  Still running... (${(i+1)*3}s)`);
      } catch (e) {
        console.log(`  Poll error: ${e.message}`);
      }
    }

    // Reload page to get final state
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'final_04_result.png', fullPage: true });
    console.log(`\n  Screenshot saved: final_04_result.png`);
  }

  console.log('\n=== Console errors ===');
  errors.length === 0 ? console.log('  None') : errors.forEach(e => console.log(`  ${e}`));

  console.log('\nDone!');
  await browser.close();
})();
