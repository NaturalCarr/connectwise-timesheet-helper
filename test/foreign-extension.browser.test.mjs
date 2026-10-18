import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { /* optional fixture dependency */ }
const brave = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const enabled = process.env.CW_EXTENSION_TEST === '1' && chromium && existsSync(brave);
const extension = fileURLToPath(new URL('../extension', import.meta.url));

test('real Brave extension input recovers from a foreign popup iframe and restores it',
  { skip: !enabled, timeout: 45000 }, async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'cw-foreign-popup-test-'));
    const companion = join(root, 'companion');
    mkdirSync(companion);
    writeFileSync(join(companion, 'manifest.json'), JSON.stringify({
      manifest_version: 3, name: 'Foreign popup fixture', version: '1.0',
      background: { service_worker: 'companion.js' },
      web_accessible_resources: [{ resources: ['popup.html'], matches: ['https://na.myconnectwise.net/*'] }]
    }));
    writeFileSync(join(companion, 'companion.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
    writeFileSync(join(companion, 'popup.html'), '<html><body style="background:blue">Fixture popup</body></html>');
    let context;
    try {
      context = await chromium.launchPersistentContext(join(root, 'profile'), {
        executablePath: brave, headless: true,
        args: [`--disable-extensions-except=${extension},${companion}`, `--load-extension=${extension},${companion}`]
      });
      const workerFor = async (suffix) => context.serviceWorkers().find((worker) => worker.url().endsWith(suffix))
        || context.waitForEvent('serviceworker', { predicate: (worker) => worker.url().endsWith(suffix), timeout: 10000 });
      const [helperWorker, companionWorker] = await Promise.all([workerFor('/background.js'), workerFor('/companion.js')]);
      const foreignId = new URL(companionWorker.url()).host;
      const page = await context.newPage();
      await page.route('https://na.myconnectwise.net/v2025_1/ConnectWise.aspx', (route) => route.fulfill({
        contentType: 'text/html', body: `<!doctype html><html><body>
          <h4>Service Ticket #8000009 - Fixture ticket</h4>
          <input class="cw_PsaSummaryHeader" value="Fixture ticket">
          <div class="cw_ToolbarButton_Save" style="margin:20px;width:50px;height:30px">Save</div>
          <table><tr><td>Status:</td><td><input class="cw_status" value="Completed"><div style="display:inline-block;width:15px;height:20px"></div></td></tr></table>
          <div class="gwt-dropdown-options"><div class="mm_label" style="width:180px;height:25px">Completed~</div></div>
          <div id="notice">You have successfully updated this record.</div>
          <iframe id="foreign-popup" src="chrome-extension://${foreignId}/popup.html" style="position:fixed;right:20px;bottom:20px;width:80px;height:80px"></iframe>
          <script>window.saves=0;window.committed=false;window.foreignFrame=document.querySelector('#foreign-popup');const host=document.createElement('div');document.body.append(host);host.attachShadow({mode:'closed'}).append(window.foreignFrame);
            document.querySelector('.mm_label').onclick=()=>{
              document.querySelector('input.cw_status').value='Completed~';
              document.querySelector('.gwt-dropdown-options').remove();window.committed=true;
            };
            document.querySelector('.cw_ToolbarButton_Save').onclick=()=>{
              window.saves++;document.querySelector('#notice').textContent='';
              setTimeout(()=>{document.querySelector('#notice').textContent='You have successfully updated this record.'},50);
            };
          </script></body></html>`
      }));
      await page.goto('https://na.myconnectwise.net/v2025_1/ConnectWise.aspx');
      await page.waitForFunction(() => window.foreignFrame?.contentWindow != null);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const tabId = await helperWorker.evaluate(async () =>
        (await chrome.tabs.query({ url: 'https://na.myconnectwise.net/*' }))[0].id);
      const baseline = await helperWorker.evaluate(async (tabId) => {
        try { await chrome.debugger.attach({ tabId }, '1.3'); await chrome.debugger.detach({ tabId }); return null; }
        catch (error) { return error.message; }
      }, tabId);
      assert.match(baseline || '', /Cannot access a chrome-extension:\/\/ URL of different extension/);
      t.diagnostic('Reproduced the exact cross-extension attach error before recovery.');
      // The production helper must commit the option, not merely retain typed search text.
      const selection = await helperWorker.evaluate(async (tabId) =>
        chooseTicketOptionInTab(tabId, 0, 'ticket-status', 'Completed', 8000009), tabId);
      assert.equal(selection.selected, 'Completed~');
      assert.equal(await page.evaluate(() => window.committed), true);
      assert.equal(await page.evaluate(() => Number(window.foreignFrame.isConnected)), 1);
      await new Promise((resolve) => setTimeout(resolve, 250));
      await helperWorker.evaluate(async (tabId) => trustedTicketSave(tabId, 0, 8000009, 'Completed'), tabId);
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(await page.evaluate(() => window.saves), 1);
      assert.equal(await page.evaluate(() => Number(window.foreignFrame.isConnected)), 1);
      const saved = await helperWorker.evaluate(async (tabId) => {
        const [result] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] },
          func: verifyTicketStatus, args: ['8000009', 'Completed'] });
        return result.result;
      }, tabId);
      assert.equal(saved.verified, true);
      assert.equal(saved.freshSaveMessage, true);
      const lease = await helperWorker.evaluate(async (tabId) => temporarilyPauseForeignExtensionFrames(tabId, true), tabId);
      await page.evaluate(() => {
        const frame = window.foreignFrame.cloneNode(true);
        const host = document.createElement('div');
        host.attachShadow({mode:'closed'}).append(frame);
        document.body.append(host); window.spawnedPopup = frame;
      });
      await page.waitForFunction(() => !window.spawnedPopup.isConnected);
      await helperWorker.evaluate(async (tabId) => {
        await chrome.debugger.attach({tabId}, '1.3');
        await chrome.debugger.detach({tabId});
      }, tabId);
      await helperWorker.evaluate(async ({tabId,lease}) => restoreForeignExtensionFrames(tabId,lease), {tabId,lease});
      assert.equal(await page.evaluate(() => window.foreignFrame.isConnected && window.spawnedPopup.isConnected), true);
    } finally {
      if (context) await context.close();
      const tempRoot = realpathSync(tmpdir());
      const target = realpathSync(root);
      if (target.startsWith(tempRoot + sep) && target !== tempRoot) rmSync(target, { recursive: true, force: true });
    }
  });


