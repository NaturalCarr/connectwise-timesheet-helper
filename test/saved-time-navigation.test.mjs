import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');

test('saved Time Entry view is used to verify a row after the count rises', async () => {
  const state = { view: 'saved-entry', reloads: 0, clicks: 0 };
  const row = { date: '10/8/26', start: '11:03 AM', end: '11:47 AM',
    notes: 'Checked HDMI', billable: 'B', workType: 'Onsite Support', workRole: 'Onsite Engineer' };
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    tabs: {
      async get() { return { url: 'https://na.myconnectwise.net/v2025_1/ConnectWise.aspx' }; },
      async reload() { state.reloads++; state.view = 'saved-entry'; }
    },
    scripting: { async executeScript({ func, args }) {
      switch (func.name) {
        case 'inspectTimeRows': return [{ frameId: 3, result: {
          matches: state.view === 'time-list', complete: true, rows: [row] } }];
        case 'inspectSavedTimeEntryFrame': return [{ frameId: 3, result: {
          matches: state.view === 'saved-entry' && args[1] === 0, saved: false,
          countIncreased: true, timeCount: 1 } }];
        case 'clickSavedEntryTimeTab':
          state.clicks++;
          state.view = 'time-list';
          return [{ frameId: 3, result: { clicked: true } }];
        case 'inspectTicketFrame': return [{ frameId: 3, result: { matches: false } }];
        default: throw new Error(`Unexpected action ${func.name}`);
      }
    } }
  };
  const entry = { date: '2026-10-08', start: '11:03', end: '11:47',
    notes: 'Checked HDMI', billable: 'B', workType: 'Onsite Support', workRole: 'Onsite Engineer' };
  const result = await runInNewContext(`${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);\nverifySavedTimeInTab({
    tabId: 7, ticketId: 8000003, entry: ${JSON.stringify(entry)}, baselineTimeCount: 0
  })`, { chrome, setTimeout(callback) { callback(); } });
  assert.equal(result.verified, true);
  assert.equal(state.reloads, 1);
  assert.equal(state.clicks, 2);
});

test('an unchanged Time count without save confirmation is not treated as saved', () => {
  const start = source.indexOf('function inspectSavedTimeEntryFrame(ticketId, baselineTimeCount) {');
  const end = source.indexOf('\nfunction clickSavedEntryTimeTab', start);
  const inspectSource = source.slice(start, end);
  const visible = () => ({ width: 80, height: 20 });
  const charge = { value: 'Example Public Schools / 8000003 - Issue', getBoundingClientRect: visible };
  const tab = { textContent: 'Time 1', getBoundingClientRect: visible };
  const document = { body: { innerText: 'Time Entry' }, querySelectorAll(selector) {
    if (selector === 'input.cw_ChargeToTextBox') return [charge];
    if (selector === 'span.GMDB3DUBOUI') return [tab];
    return [];
  } };
  assert.equal(runInNewContext(`${inspectSource}\ninspectSavedTimeEntryFrame('8000003', 1).matches`,
    { document }), false);
  assert.equal(runInNewContext(`${inspectSource}\ninspectSavedTimeEntryFrame('8000003', 0).matches`,
    { document }), true);
});
