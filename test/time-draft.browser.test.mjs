import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { /* optional browser dependency */ }
const brave = 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
const enabled = process.env.CW_BROWSER_TEST === '1' && chromium && existsSync(brave);
const popupPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'popup.js');
const formPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'form-functions.js');
const backgroundPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'background.js');

test('draft fill writes fields but does not click Save', { skip: !enabled }, async () => {
  const browser = await chromium.launch({ executablePath: brave, headless: true });
  try {
    const page = await browser.newPage();
    let saved = false;
    const html = `<!doctype html><html><head><style>
      body{font:14px Arial}.row{display:flex;gap:10px;margin:10px}.label{width:80px}
      input{width:180px}.public-DraftEditor-content{width:400px;height:60px;border:1px solid #aaa}
    </style></head><body>
      <form id="draft-form"></form><button id="inspect"></button><button id="copy"></button><textarea id="result"></textarea><p id="status"></p>
      <input class="cw_ChargeToTextBox" value="Example / 8000006 - SCHB - Copier">
      <input class="cw_isEnteringTime" type="checkbox" checked>
      <div class="row"><div class="label">Date:</div><input type="text"></div>
      <input class="cw_startTime" value="2:54 PM"><input class="cw_endTime">
      <input class="cw_hours" value="0.00"><input class="cw_workType" value="Onsite Support">
      <input class="cw_workRole" value="Onsite Engineer"><input class="cw_billable" value="Billable">
      <input class="cw_ticketStatus" value="Working Issue Now">
      <div class="public-DraftEditor-content" contenteditable="true" role="textbox"></div>
      <input class="cw_isToContact" type="checkbox" checked><input class="cw_isToResources" type="checkbox">
      <input class="cw_isToCcs" type="checkbox"><input class="cw_isDiscussion" type="checkbox" checked>
      <input class="cw_isInternal" type="checkbox"><input class="cw_isResolution" type="checkbox">
      <div class="cw_ToolbarButton_SaveAndReturn" onclick="window.saved=true">Save & Return</div>
      <script>document.querySelector('.cw_endTime').addEventListener('change',()=>{
        const start=document.querySelector('.cw_startTime').value;const end=document.querySelector('.cw_endTime').value;
        const minutes=(value)=>{const m=value.match(/(\\d+):(\\d+) (AM|PM)/);return (Number(m[1])%12+(m[3]==='PM'?12:0))*60+Number(m[2])};
        document.querySelector('.cw_hours').value=((minutes(end)-minutes(start))/60).toFixed(2);
      });
      document.querySelector('.public-DraftEditor-content').addEventListener('beforeinput',(event)=>{
        window.notesInputTrusted=event.isTrusted;
        if(!event.isTrusted) event.currentTarget.remove();
      });</script>
    </body></html>`;
    await page.route('https://na.myconnectwise.net/v2025_1/timeexpensemodule.html', (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    await page.goto('https://na.myconnectwise.net/v2025_1/timeexpensemodule.html');
    await page.addScriptTag({ path: formPath });
    await page.addScriptTag({ path: popupPath });
    await page.evaluate(() => { window.chrome = { runtime: { onMessage: { addListener() {} } } }; });
    await page.addScriptTag({ path: backgroundPath });
    const wrongTicket = await page.evaluate(() => fillTimeDraft({
      ticketId: '99', date: '2026-10-05', start: '15:00', end: '16:00',
      workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B', notes: 'Checked projector'
    }));
    assert.equal(wrongTicket.ok, false);
    assert.equal(await page.locator('.cw_endTime').inputValue(), '');
    await page.locator('.cw_ticketStatus').fill('Completed');
    const closedTicket = await page.evaluate(() => fillTimeDraft({
      ticketId: '8000006', date: '2026-10-05', start: '15:00', end: '16:00',
      workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B', notes: 'Checked projector'
    }));
    assert.match(closedTicket.error, /Working Issue Now/);
    await page.locator('.cw_ticketStatus').fill('Working Issue Now');
    const outcome = await page.evaluate(() => fillTimeDraft({
      ticketId: '8000006', date: '2026-10-05', start: '15:00', end: '16:00',
      workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B', notes: 'Checked projector'
    }));
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    assert.equal(outcome.saved, false);
    assert.equal(outcome.notesEntered, false);
    assert.deepEqual(outcome.warnings, []);
    await page.evaluate(() => {
      document.querySelector('.cw_endTime').value = '';
      const input = document.querySelector('.cw_workType');
      const arrow = document.createElement('div');
      arrow.style.cssText = 'display:inline-block;width:20px;height:20px';
      input.after(arrow);
      arrow.onclick = () => {
        const menu = document.createElement('div'); menu.className = 'gwt-dropdown-options';
        menu.innerHTML = '<div class="mm_label">$Onsite Support</div>';
        document.body.append(menu);
        setTimeout(() => {
          const wrapper = document.createElement('div');
          const option = document.createElement('div'); option.className = 'mm_label';
          option.textContent = '$Paid Time Off (Or\u00a0Sick and Vacation)';
          option.onclick = () => { input.value = option.textContent; document.querySelector('.cw_billable').value = 'Do Not Bill'; menu.remove(); };
          wrapper.append(option); menu.append(wrapper);
        }, 600);
      };
    });
    const paidTime = await page.evaluate(() => fillTimeDraft({
      ticketId: '8000006', date: '2026-10-05', start: '15:00', end: '16:00',
      workType: 'Paid Time Off (Or Sick and Vacation)', workRole: 'Onsite Engineer', billable: 'AUTO', notes: 'Actual leave'
    }));
    assert.equal(paidTime.ok, true, JSON.stringify(paidTime));
    assert.equal(await page.locator('.cw_billable').inputValue(), 'Do Not Bill');
    assert.equal(await page.locator('.cw_startTime').inputValue(), '3:00 PM');
    assert.equal(await page.locator('.cw_endTime').inputValue(), '4:00 PM');
    assert.equal(await page.locator('.public-DraftEditor-content').innerText(), '');
    assert.equal(await page.locator('.public-DraftEditor-content').isVisible(), true);
    assert.deepEqual(await page.evaluate(() => focusBlankNotes('8000006')), { ok: true });
    const session = await page.context().newCDPSession(page);
    await session.send('Input.insertText', { text: 'Checked projector' });
    assert.deepEqual(await page.evaluate(() => verifyNotes('8000006', 'Checked projector')), { ok: true });
    assert.equal(await page.evaluate(() => window.notesInputTrusted), true);
    await session.detach();
    assert.equal(await page.locator('.cw_isToContact').isChecked(), false);
    saved = await page.evaluate(() => Boolean(window.saved));
    assert.equal(saved, false);
    const filledForm = await page.evaluate(() => fillTimeDraft({
      ticketId: '8000006', date: '2026-10-05', start: '16:00', end: '17:00',
      workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B', notes: 'Different notes'
    }));
    assert.equal(filledForm.ok, false);
    assert.equal(await page.locator('.cw_endTime').inputValue(), '4:00 PM');

    const shell = await browser.newPage();
    await shell.route('https://na.myconnectwise.net/v2025_1/ConnectWise.aspx', (route) => route.fulfill({
      body: '<iframe src="/v2025_1/timeexpensemodule.html" style="width:900px;height:700px"></iframe>',
      contentType: 'text/html'
    }));
    await shell.route('https://na.myconnectwise.net/v2025_1/timeexpensemodule.html', (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    await shell.goto('https://na.myconnectwise.net/v2025_1/ConnectWise.aspx');
    await shell.addScriptTag({ path: formPath });
    await shell.addScriptTag({ path: popupPath });
    const timeFrame = shell.frames().find((frame) => frame.url().endsWith('/timeexpensemodule.html'));
    assert.ok(timeFrame);
    await timeFrame.addScriptTag({ path: formPath });
    await timeFrame.addScriptTag({ path: popupPath });
    await timeFrame.evaluate(() => { window.chrome = { runtime: { onMessage: { addListener() {} } } }; });
    await timeFrame.addScriptTag({ path: backgroundPath });
    assert.equal((await shell.evaluate(() => detectTimeFrame('8000006'))).isTimeForm, false);
    assert.equal((await timeFrame.evaluate(() => detectTimeFrame('8000006'))).matches, true);
    assert.equal((await timeFrame.evaluate(() => detectTimeFrame('99'))).matches, false);
    assert.deepEqual(await timeFrame.evaluate(() => focusBlankNotes('8000006')), { ok: true });
    const shellSession = await shell.context().newCDPSession(shell);
    await shellSession.send('Input.insertText', { text: 'Nested frame note' });
    assert.deepEqual(await timeFrame.evaluate(() => verifyNotes('8000006', 'Nested frame note')), { ok: true });
    assert.equal(await timeFrame.evaluate(() => window.notesInputTrusted), true);
    await shellSession.detach();

    const embeddedPath = await browser.newPage();
    await embeddedPath.route('https://na.myconnectwise.net/v2025_1/ConnectWise.aspx', (route) => route.fulfill({ body: html, contentType: 'text/html' }));
    await embeddedPath.goto('https://na.myconnectwise.net/v2025_1/ConnectWise.aspx');
    await embeddedPath.addScriptTag({ path: formPath });
    await embeddedPath.addScriptTag({ path: popupPath });
    assert.equal((await embeddedPath.evaluate(() => detectTimeFrame('8000006'))).matches, true);
  } finally {
    await browser.close();
  }
});
