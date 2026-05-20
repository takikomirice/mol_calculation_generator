import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return null;
  }
}

test('playwright smoke: student screen opens and exposes the answer form only', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('playwright package is not installed');
    return;
  }

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

test('playwright smoke: admin screen opens without calling real Classroom APIs', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('playwright package is not installed');
    return;
  }

  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  try {
    await page.goto(pathToFileURL(`${process.cwd()}/Admin.html`).href);
    await assert.doesNotReject(page.locator('#setupPanel').waitFor({ timeout: 1500 }));
    await assert.doesNotReject(page.locator('#webAppUrlInput').waitFor({ timeout: 1500 }));
    await assert.doesNotReject(page.locator('#classroomPanel').waitFor({ timeout: 1500 }));
  } finally {
    await browser.close();
  }
});
