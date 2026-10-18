import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { /* optional fixture dependency */ }
const brave = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const enabled = process.env.CW_BROWSER_TEST === '1' && chromium && existsSync(brave);
const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');

async function fixture(run) {
  const browser = await chromium.launch({ executablePath: brave, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    await page.setContent(`<style>body{margin:0}iframe{position:absolute;left:120px;top:80px;
      width:760px;height:500px;transform:scale(.8);transform-origin:top left}</style>
      <div id="navigation" style="position:fixed;left:0;top:0;width:100px;height:100px">Navigation</div>
      <iframe></iframe>`);
    const frame = page.frames()[1];
    await frame.setContent(`<style>html{scroll-behavior:smooth}body{height:1500px;margin:0}
      .cw_ToolbarButton_Save{width:30px;height:25px;margin:20px;cursor:pointer}</style>
      <h4>Service Ticket #8000013 - SCHC - Fixture</h4>
      <div class="cw_ToolbarButton_Save"><span>Save</span></div>
      <table><tr><td>Status:</td><td><input class="cw_status" value="Completed"></td></tr></table>
      <div id="notice">You have successfully updated this record.</div>
      <script>window.saves=0;document.querySelector('.cw_ToolbarButton_Save').onclick=()=>{
        window.saves++;document.querySelector('#notice').textContent='';
        setTimeout(()=>{document.querySelector('#notice').textContent='You have successfully updated this record.'},50);
      };</script>`);
    const session = await page.context().newCDPSession(page);
    const mouseEvents = [];
    const listeners=new Map();
    const chrome = {
      runtime: { onMessage: { addListener() {} } },
      tabs: { async update() {} },
      scripting: { async executeScript({ func, args = [] }) {
        return [{ frameId: 3, result: await frame.evaluate(
          ({ code, args }) => (0, eval)(`(${code})`)(...args), { code: func.toString(), args }) }];
      } },
      debugger: {
        onEvent:{addListener(fn){const pairs=['Page.javascriptDialogOpening','Page.frameNavigated'].map(method=>{const handler=params=>fn({tabId:7},method,params);session.on(method,handler);return [method,handler];});listeners.set(fn,pairs);},removeListener(fn){for(const [method,handler] of listeners.get(fn)||[])session.off(method,handler);listeners.delete(fn);}},
        async attach() {
          // Emulate a layout change when browser debugging begins.
          await page.locator('iframe').evaluate((element) => { element.style.top = '140px'; });
        },
        async detach() {},
        async sendCommand(_target, method, params) {
          if (method === 'Input.dispatchMouseEvent') mouseEvents.push(params.type);
          return session.send(method, params);
        }
      }
    };
    await run({ page, frame, chrome, mouseEvents });
    await session.detach();
  } finally { await browser.close(); }
}

test('ticket Save survives scroll, scaled iframe, and layout shift in a fresh Brave fixture',
  { skip: !enabled }, async () => fixture(async ({ frame, chrome, mouseEvents }) => {
    await frame.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }));
    await runInNewContext(`${source}\ntrustedTicketSave(7, 3, 8000013, 'Completed')`, { chrome, setTimeout });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(await frame.evaluate(() => window.saves), 1);
    assert.deepEqual(mouseEvents, []);
    const check = await chrome.scripting.executeScript({
      func: runInNewContext(`${source}\nverifyTicketStatus`, { chrome }),
      args: ['8000013', 'Completed']
    });
    assert.equal(check[0].result.verified, true);
  }));

test('ticket Save activates only its exact element despite a password-manager overlay',
  { skip: !enabled }, async () => fixture(async ({ page, frame, chrome, mouseEvents }) => {
    await page.evaluate(() => {
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(0,0,255,.1)';
      document.body.append(overlay);
    });
    await runInNewContext(`${source}\ntrustedTicketSave(7, 3, 8000013)`, { chrome, setTimeout });
    assert.equal(await frame.evaluate(() => window.saves), 1);
    assert.deepEqual(mouseEvents, []);
  }));

test('an old success notice cannot verify unsaved Completed in a Brave fixture',
  { skip: !enabled }, async () => fixture(async ({ chrome }) => {
    const functions = runInNewContext(`${source}\n({ armTicketSaveObservation, verifyTicketStatus })`, { chrome });
    await chrome.scripting.executeScript({ func: functions.armTicketSaveObservation, args: ['8000013'] });
    const [check] = await chrome.scripting.executeScript({ func: functions.verifyTicketStatus,
      args: ['8000013', 'Completed'] });
    assert.equal(check.result.verified, false);
    assert.equal(check.result.freshSaveMessage, false);
  }));

test('a typed Completed search is committed by selecting its actual option in a Brave fixture',
  { skip: !enabled }, async () => fixture(async ({ frame, chrome }) => {
    await frame.evaluate(() => {
      const input = document.querySelector('input.cw_status');
      const arrow = document.createElement('div');
      arrow.style.cssText = 'display:inline-block;width:15px;height:20px';
      input.after(arrow);
      const picker = document.createElement('div');
      picker.className = 'gwt-dropdown-options';
      picker.style.cssText = 'position:absolute;left:100px;top:150px;background:white';
      const option = document.createElement('div');
      option.className = 'mm_label';
      option.style.cssText = 'width:180px;height:25px';
      option.textContent = 'Completed~';
      option.onclick = () => { input.value = 'Completed~'; picker.remove(); window.statusSelected = true; };
      picker.append(option);
      document.body.append(picker);
    });
    const result = await runInNewContext(
      `${source}\nchooseTicketOptionInTab(7, 3, 'ticket-status', 'Completed', 8000013)`,
      { chrome, setTimeout });
    assert.equal(result.selected, 'Completed~');
    assert.equal(await frame.evaluate(() => window.statusSelected), true);
    assert.equal(await frame.evaluate(() => window.saves), 0);
  }));

test('Work Type uses a trusted option click when synthetic clicks are ignored',
  { skip: !enabled }, async () => fixture(async ({ frame, chrome }) => {
    await frame.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<input class="cw_ChargeToTextBox" value="Company / 8000013 - Fixture"><input class="cw_workType" value="$Onsite Support"><div style="display:inline-block;width:20px;height:20px"></div><div class="gwt-dropdown-options"><div><div class="mm_label" style="width:220px;height:25px">$Paid Time Off (Or Sick and Vacation)</div></div></div>');
      document.querySelector('.mm_label').onclick = (event) => {
        if (!event.isTrusted) return;
        document.querySelector('.cw_workType').value = event.currentTarget.textContent;
        document.querySelector('.gwt-dropdown-options').remove();
      };
      document.querySelector('.mm_label').click();
    });
    assert.equal(await frame.locator('.cw_workType').inputValue(), '$Onsite Support');
    const result = await runInNewContext(`${source}\nchooseTicketOptionInTab(7,3,'input.cw_workType','Paid Time Off (Or Sick and Vacation)',8000013)`, { chrome, setTimeout });
    assert.match(result.selected, /Paid Time Off/);
    assert.equal(await frame.locator('.gwt-dropdown-options').count(), 0);
    assert.equal(await frame.evaluate(() => window.saves), 0);
  }));

test('Assign Me is measured after attachment and clicked on the expected ticket action',
  { skip: !enabled }, async () => fixture(async ({ frame, chrome }) => {
    await frame.evaluate(() => {
      const button = document.createElement('button'); button.textContent = 'ASSIGN ME';
      button.onclick = (event) => { if (event.isTrusted) window.assigned = true; };
      document.body.append(button);
    });
    await runInNewContext(`${source}\ntrustedTicketControlClick(7,3,8000013,'assign-me')`, { chrome, setTimeout });
    assert.equal(await frame.evaluate(() => window.assigned), true);
    assert.equal(await frame.evaluate(() => window.saves), 0);
  }));

test('an existing owner can be replaced through the exact owner option with trusted input',
  { skip: !enabled }, async () => fixture(async ({ frame, chrome }) => {
    await frame.evaluate(() => {
      document.body.insertAdjacentHTML('beforeend', '<input class="cw_ticketOwner" value="Other Owner"><div style="display:inline-block;width:20px;height:20px"></div><div class="gwt-dropdown-options"><div class="mm_label" style="width:200px;height:25px">Example Engineer</div></div>');
      document.querySelector('.mm_label').onclick = (event) => {
        if (!event.isTrusted) return;
        document.querySelector('.cw_ticketOwner').value = event.currentTarget.textContent;
        document.querySelector('.gwt-dropdown-options').remove();
      };
    });
    await runInNewContext(`${source}\nchooseTicketOptionInTab(7,3,'input.cw_ticketOwner','Example Engineer',8000013)`, { chrome, setTimeout });
    assert.equal(await frame.locator('.cw_ticketOwner').inputValue(), 'Example Engineer');
    assert.equal(await frame.evaluate(() => window.saves), 0);
  }));



test('New Ticket status survives debugger attachment shifting the scaled frame',
  { skip: !enabled }, async () => fixture(async ({ frame, chrome, mouseEvents }) => {
    await frame.setContent(`<h4>New Ticket</h4><input class="cw_PsaSummaryHeader">
      <table><tr><td>Status:</td><td><input class="cw_status" value="Pre-Process"><div style="display:inline-block;width:20px;height:20px"></div></td></tr></table>
      <div class="gwt-dropdown-options" style="position:absolute;left:100px;top:150px"><div class="mm_label" style="width:180px;height:25px">Working Issue Now</div></div>
      <script>window.choices=0;document.querySelector('.mm_label').onclick=event=>{
        if(!event.isTrusted)return;
        window.choices++;document.querySelector('.cw_status').value='Working Issue Now';
        document.querySelector('.gwt-dropdown-options').remove();
      };</script>`);
    const result = await runInNewContext(`${source}\nchooseTicketOptionInTab(7,3,'ticket-status','Working Issue Now')`, {chrome,setTimeout});
    assert.equal(result.selected,'Working Issue Now');
    assert.equal(await frame.evaluate(()=>window.choices),1);
    assert.equal(mouseEvents.filter(type=>type==='mousePressed').length,1);
  }));

test('explicit Billable uses a trusted option click when synthetic clicks are ignored',
 {skip:!enabled},async()=>fixture(async({frame,chrome})=>{
  await frame.setContent(`<h4>Time Entry</h4><input class="cw_ChargeToTextBox" value="Company / 8000013 - Fixture"><input class="cw_billable" value="Do Not Bill"><div style="display:inline-block;width:20px;height:20px"></div><div class="gwt-dropdown-options"><div><div class="mm_label" style="width:220px;height:25px">Billable</div></div></div><script>window.selections=0;document.querySelector('.mm_label').onclick=event=>{if(!event.isTrusted)return;window.selections++;document.querySelector('.cw_billable').value='Billable';document.querySelector('.gwt-dropdown-options').remove();};</script>`);
  const result=await runInNewContext(`${source}\nchooseTicketOptionInTab(7,3,'input.cw_billable','Billable',8000013)`,{chrome,setTimeout});
  assert.equal(result.selected,'Billable');assert.equal(await frame.evaluate(()=>window.selections),1);
 }));

test('real browser unsaved-changes prompt is cancelled without discarding the form',
 {skip:!enabled},async()=>fixture(async({page,frame,chrome})=>{
   page.on('dialog',()=>{});
   await page.locator('#navigation').click();
   await page.evaluate(()=>{window.addEventListener('beforeunload',event=>{event.preventDefault();event.returnValue='';});});
   await assert.rejects(runInNewContext(`${source}\nconnectwiseTab=async()=>{};reloadConnectWiseSafely(7);`,{chrome,setTimeout,clearTimeout}),/Reload was cancelled to preserve/);
   assert.equal(await frame.locator('.cw_status').inputValue(),'Completed');
 }));
