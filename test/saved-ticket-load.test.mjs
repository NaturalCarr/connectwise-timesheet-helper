import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');

test('saved ticket verification waits through incomplete reload frames', async () => {
  let reads = 0;
  let reloads = 0;
  const chrome = {
    runtime: { onMessage: { addListener() {} } },
    tabs: { async reload() { reloads++; } },
    scripting: { async executeScript() {
      reads++;
      return [{ result: reads <= 4
        ? { verified: false, error: 'input.cw_PsaSummaryHeader was not saved as requested.' }
        : { verified: true } }];
    } }
  };
  const result = await runInNewContext(`${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);\nmatchingFrame = async () => ({ frameId: 0 });
    verifyCreatedTicketAfterReload(7, 8000001, { summary: 'SCHD - Repeat Jams' })`, {
    chrome, setTimeout(callback) { callback(); }
  });
  assert.equal(reloads, 1);
  assert.equal(reads, 7);
  assert.equal(result.ticketId, 8000001);
  assert.equal(result.verified, true);
});
