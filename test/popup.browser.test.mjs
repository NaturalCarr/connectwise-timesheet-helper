import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {}
test('loaded popup shows title lookup and reveals time fields; owner survives clear',
  { skip: process.env.CW_BROWSER_TEST !== '1' || !chromium }, async () => {
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe', headless: true });
    try {
      const page = await browser.newPage();
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      await page.route('https://helper.test/**', (route) => {
        const path = new URL(route.request().url()).pathname.slice(1);
        try { route.fulfill({ body: readFileSync(new URL(`../extension/${path}`, import.meta.url)),
          contentType: path.endsWith('.html') ? 'text/html' : path.endsWith('.json') ? 'application/json' : path.endsWith('.css') ? 'text/css' : 'text/javascript' }); }
        catch { route.fulfill({ status: 404, body: '' }); }
      });
      await page.addInitScript(() => {
        const values = {};
        window.chrome = { runtime: { getURL: (path) => `https://helper.test/${path}`,
          sendMessage: async () => ({ ok: true, version: '0.8.26', ticketSaveMethod: 'exact-element' }) },
          storage: { local: { async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]])); },
            async set(next) { Object.assign(values, next); }, async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key]; } } } };
      });
      await page.goto('https://helper.test/popup.html');
      await page.waitForFunction(() => document.getElementById('owner-settings-status').textContent.length > 0);
      await page.locator('#ticket-add-time').click();
      assert.equal(await page.locator('#ticket-time-fields').isVisible(), true);
      assert.equal(await page.locator('#ticket-time-date').isEnabled(), true);
      await page.locator('#ticket-add-time').click();
      assert.equal(await page.locator('[data-time-entry]:visible').count(), 2);
      await page.locator('[data-time-entry]:visible').last().locator('.remove-time-entry').click();
      assert.equal(await page.locator('[data-time-entry]:visible').count(), 1);
      assert.equal(await page.locator('#ticket-time-work-type').evaluate((el) => el.tagName), 'SELECT');
      assert.equal(await page.locator('#ticket-time-work-type option').count(), 15);
      assert.equal(await page.locator('#ticket-time-billable').inputValue(), 'AUTO');
      assert.equal(await page.locator('#ticket-time-billable').isVisible(), false);
      assert.equal(await page.locator('#current-time-section').count(), 0);
      assert.equal(await page.locator('#ticket-title-contains').isVisible(), true);
      await page.locator('#ticket-owner-setting').fill('Coworker Name');
      await page.locator('#owner-settings-form button').click();
      await page.locator('#weekly-section > summary').click();
      await page.locator('#week-json').fill('{invalid');
      await page.locator('#validate-week').click();
      await page.waitForFunction(() => document.getElementById('week-status').dataset.state === 'error');
      assert.equal(await page.locator('#run-week').isDisabled(), true);
      const daily = JSON.parse(readFileSync(new URL('../extension/DAILY-EXAMPLE.json', import.meta.url)));
      daily.exampleOnly = false;
      await page.locator('#week-json').fill(JSON.stringify(daily, null, 2));
      assert.ok(await page.locator('#week-json').evaluate((el) => el.getBoundingClientRect().height) <= 54);
      await page.locator('#validate-week').click();
      await page.waitForFunction(() => document.getElementById('week-status').dataset.state === 'valid');
      assert.match(await page.locator('#week-status').innerText(), /JSON valid/);
      assert.equal(await page.locator('#run-week').isEnabled(), true);
      await page.locator('#ticket-complete-after-time').selectOption('Waiting Client Response');
      await page.waitForFunction(async () => (await chrome.storage.local.get('helperSettings:lastTicketStatus'))['helperSettings:lastTicketStatus'] === 'Waiting Client Response');
      await page.locator('#clear-saved-inputs').click();
      assert.equal(await page.locator('#ticket-complete-after-time').inputValue(), 'Waiting Client Response');
      assert.equal(await page.locator('#ticket-school').getAttribute('required'), null);
      assert.equal(await page.locator('#open-title-match').count(), 0);
      const textarea = page.locator('#ticket-description');
      const initialHeight = await textarea.evaluate((el) => el.getBoundingClientRect().height);
      assert.ok(initialHeight <= 36);
      await textarea.fill('Actual details '.repeat(100));
      assert.ok(await textarea.evaluate((el) => el.getBoundingClientRect().height) > initialHeight);
      assert.equal(await page.locator('#ticket-owner-setting').inputValue(), 'Coworker Name');
      assert.equal(await page.evaluate(async () => (await chrome.storage.local.get('helperSettings:ticketOwner'))['helperSettings:ticketOwner']), 'Coworker Name');
      await page.getByText('Download Example Files', {exact:true}).click();
      assert.equal(await page.locator('#download-eod-sample').isVisible(),true);
      assert.equal(await page.locator('#copy-eod-sample svg').count(),1);
      await page.evaluate(() => Object.defineProperty(navigator,'clipboard',{configurable:true,value:{async write(items){window.exampleClipboard=await items[0].getType('text/html').then(blob=>blob.text());}}}));
      await page.locator('#copy-eod-sample').click();
      await page.waitForFunction(()=>Boolean(window.exampleClipboard));
      assert.match(await page.evaluate(()=>window.exampleClipboard),/border:1px solid #444/);
      assert.match(await page.evaluate(()=>window.exampleClipboard),/T-EXAMPLE/);
      const downloadPromise=page.waitForEvent('download');
      await page.locator('#download-eod-sample').click();
      assert.equal((await downloadPromise).suggestedFilename(),'ConnectWise-Daily-Report-example.html');
      await page.getByText('Time-entry presets',{exact:true}).click();
      await page.locator('#time-preset').selectOption('huddle');
      await page.locator('#add-preset').click();
      const presetEntry=await page.evaluate(()=>window.ticketEntries.read().at(-1));
      assert.equal(presetEntry.billable,'B');assert.equal(presetEntry.start,'');assert.equal(presetEntry.end,'');assert.equal(presetEntry.date,'');
      assert.equal(presetEntry.workType,'Onsite Support');
      assert.deepEqual(errors, []);
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable:true, value: { async writeText(value) { window.copiedRunResult=value; } } });
      });
      await page.goto('https://helper.test/runner.html');
      await page.waitForFunction(() => document.getElementById('result').textContent.length > 0);
      await page.locator('#copy-run-result').click();
      assert.equal(await page.evaluate(() => window.copiedRunResult), await page.locator('#result').textContent());
      assert.equal(JSON.parse(await page.evaluate(() => window.copiedRunResult)).ok, false);
    } finally { await browser.close(); }
  });




