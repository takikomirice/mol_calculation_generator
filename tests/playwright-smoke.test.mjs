import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (error) {
    throw new Error('playwright package is required for smoke tests. Run npm install.', { cause: error });
  }
}

test('playwright smoke: student screen opens and exposes the answer form only', async () => {
  const playwright = await loadPlaywright();

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(`${process.cwd()}/Student.html`).href);
    await assert.doesNotReject(page.locator('#questionText').waitFor({ timeout: 1500 }));
    await assert.doesNotReject(page.locator('#answerInput').waitFor({ timeout: 1500 }));
    await assert.doesNotReject(page.locator('#submitButton').waitFor({ timeout: 1500 }));
  } finally {
    await browser.close();
  }
});

test('playwright smoke: monitor screen opens without write controls', async () => {
  const playwright = await loadPlaywright();

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(`${process.cwd()}/Monitor.html`).href);
    await assert.doesNotReject(page.locator('#studentTable').waitFor({ timeout: 1500 }));
    await assert.doesNotReject(page.locator('#refreshButton').waitFor({ timeout: 1500 }));
    await assert.doesNotReject(page.locator('#autoRefreshToggle').waitFor({ timeout: 1500 }));
    assert.equal(await page.locator('form').count(), 0);
  } finally {
    await browser.close();
  }
});
