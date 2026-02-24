import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const artifactsDir = path.resolve('.artifacts');
const logsDir = path.join(artifactsDir, 'logs');
const videosDir = path.join(artifactsDir, 'videos');

fs.mkdirSync(logsDir, { recursive: true });
fs.mkdirSync(videosDir, { recursive: true });

const consoleEntries = [];
const pageErrors = [];
const requestFailures = [];
const responseErrors = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  recordVideo: { dir: videosDir, size: { width: 1440, height: 900 } },
  viewport: { width: 1440, height: 900 }
});

await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

const page = await context.newPage();

page.on('console', (msg) => {
  consoleEntries.push({
    type: msg.type(),
    text: msg.text(),
    location: msg.location()
  });
});

page.on('pageerror', (error) => {
  pageErrors.push({
    name: error.name,
    message: error.message,
    stack: error.stack
  });
});

page.on('requestfailed', (request) => {
  requestFailures.push({
    url: request.url(),
    method: request.method(),
    failure: request.failure()?.errorText
  });
});

page.on('response', async (response) => {
  if (response.status() >= 400) {
    responseErrors.push({
      url: response.url(),
      status: response.status(),
      statusText: response.statusText()
    });
  }
});

let actionResult = 'not-started';

try {
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1000);

  const reimbursementText = `Client's full name: Dylan Crane
Address: 3A Acre Street, Oran Park
Staff member to reimburse: Isaac Thompson
Approved by: Isaac Thompson

Particular | Date Purchased | Amount | On Charge Y/N
Pocket Money | 15.2.25 | $20 | N
Takeout | 12.2.26 | $19.45 | N

Total Amount: $39.45`;

  await page.locator('textarea').first().fill(reimbursementText);
  await page.getByRole('button', { name: 'Start Audit' }).click();
  actionResult = 'clicked-start-audit';

  await Promise.race([
    page.locator('p.text-red-200').first().waitFor({ timeout: 20000 }),
    page.getByRole('heading', { name: /Final Decision & Email/i }).waitFor({ timeout: 20000 })
  ]).catch(() => null);

  const visibleErrorText = await page.locator('p.text-red-200').allInnerTexts();
  fs.writeFileSync(path.join(logsDir, 'detected-ui-errors.json'), JSON.stringify(visibleErrorText, null, 2));

  await page.screenshot({ path: path.join(artifactsDir, 'after-action.png'), fullPage: true });
} catch (error) {
  actionResult = `script-error: ${error.message}`;
  fs.writeFileSync(
    path.join(logsDir, 'runner-error.json'),
    JSON.stringify({ message: error.message, stack: error.stack }, null, 2)
  );
} finally {
  await context.tracing.stop({ path: path.join(artifactsDir, 'session-trace.zip') });
  const pages = context.pages();
  const videoPath = pages[0]?.video() ? await pages[0].video().path() : null;

  await context.close();
  await browser.close();

  fs.writeFileSync(
    path.join(logsDir, 'console-logs.json'),
    JSON.stringify(
      {
        actionResult,
        consoleEntries,
        pageErrors,
        requestFailures,
        responseErrors,
        capturedAt: new Date().toISOString(),
        videoPath
      },
      null,
      2
    )
  );
}
