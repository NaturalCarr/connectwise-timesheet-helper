import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');

test('New Time Entry waits through a replaced ticket frame and verifies the Time list', async () => {
  const state = { detectReads: 0, detailReads: 0, timeView: false, newClicked: false, actions: [] };
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    tabs: { async get() { return { url: 'https://na.myconnectwise.net/v2025_1/ConnectWise.aspx' }; } },
    scripting: { async executeScript({ func }) {
      const name = func.name;
      state.actions.push(name);
      if (name === 'inspectTimeRows') return [{ frameId: 4, result: {
        matches: state.timeView, complete: state.timeView, rows: [] } }];
      if (name === 'inspectTicketFrame') return [{ frameId: 4, result: {
        matches: ++state.detailReads > 2, status: 'Working Issue Now' } }];
      if (name === 'clickTicketTimeTab') {
        state.timeView = true;
        return [{ frameId: 4, result: { clicked: true } }];
      }
      if (name === 'clickNewTimeEntry') {
        state.newClicked = true;
        return [{ frameId: 4, result: { clicked: true } }];
      }
      if (name === 'detectTimeFrame') return [{ frameId: 4, result: {
        matches: state.newClicked && ++state.detectReads > 40, ticketId: '8000003' } }];
      throw new Error(`Unexpected browser action: ${name}`);
    } }
  };
  const result = await runInNewContext(`${source}\nopenNewTimeEntryInTab({tabId: 7, ticketId: 8000003})`, {
    chrome, detectTimeFrame() {}, setTimeout(callback) { callback(); }
  });
  assert.equal(result.ok, true);
  assert.ok(state.detectReads > 30);
  assert.equal(state.actions.filter(action => action === 'clickNewTimeEntry').length, 1);
  assert.equal(result.ticketId, 8000003);
  assert.equal(state.detailReads, 3);
  assert.equal(state.actions.indexOf('clickTicketTimeTab') < state.actions.indexOf('clickNewTimeEntry'), true);
});


test('duplicate lookup waits for slow Time list without clicking New or Save', async () => {
  const result = await runInNewContext(`${source}
    let reads = 0, clicks = 0;
    connectwiseTab = async () => {};
    readTimeRowsInTab = async () => {
      if (++reads < 25) throw new Error('Time view still loading');
      return {rows:[]};
    };
    matchingFrame = async () => ({frameId:4});
    executeConnectWiseScript = async ({func}) => {
      if (func.name !== 'clickTicketTimeTab') throw new Error('Unexpected write');
      clicks++;
    };
    findTimeEntriesInTab({tabId:7,ticketId:8000005,entry:{date:'2026-10-15',start:'11:03',end:'11:15',notes:'Setup'}})
      .then(result => ({result,reads,clicks}));`, {
    chrome: {runtime:{onMessage:{addListener(){}}}}, setTimeout(callback) { callback(); }
  });
  assert.equal(result.result.ok, true);
  assert.equal(result.reads, 25);
  assert.equal(result.clicks, 1);
  assert.equal(result.result.matches.length, 0);
});
