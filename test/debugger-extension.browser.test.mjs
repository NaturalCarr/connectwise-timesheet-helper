import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { /* optional browser dependency */ }
const brave = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const enabled = process.env.CW_EXTENSION_TEST === '1' && chromium && existsSync(brave);
const extension = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'extension');

test('extension debugger types Notes into a ConnectWise tab', { skip: !enabled }, async () => {
  const profile = mkdtempSync(join(tmpdir(), 'cw-extension-test-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: brave,
      headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10000 });
    const extensionId = new URL(worker.url()).host;
    const connectwise = await context.newPage();
    await connectwise.route('https://na.myconnectwise.net/v2025_1/ConnectWise.aspx', (route) => route.fulfill({
      contentType: 'text/html',
      body: '<input class="cw_ChargeToTextBox" value="Example / 8000006 - SCHB"><div class="public-DraftEditor-content" contenteditable="true" style="width:400px;height:100px;border:1px solid"></div>'
    }));
    await connectwise.goto('https://na.myconnectwise.net/v2025_1/ConnectWise.aspx');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await connectwise.bringToFront();
    const response = await popup.evaluate(async () => {
      const tabs = await chrome.tabs.query({ url: 'https://na.myconnectwise.net/*' });
      return chrome.runtime.sendMessage({
        action: 'enterNotes', tabId: tabs[0].id, frameId: 0, ticketId: '8000006', notes: 'Verified note'
      });
    });
    assert.deepEqual(response, { ok: true });
    assert.equal(await connectwise.locator('.public-DraftEditor-content').innerText(), 'Verified note');
  } finally {
    if (context) await context.close();
    const root = realpathSync(tmpdir());
    const target = realpathSync(profile);
    if (target.startsWith(root + sep)) rmSync(target, { recursive: true, force: true });
  }
});
