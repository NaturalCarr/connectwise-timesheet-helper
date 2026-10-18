import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
test('missing owner choice adds resource once, explicitly selects owner, saves and reloads', async () => {
  const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const calls = []; let selected = false;
  const chrome = { runtime: { onMessage: { addListener() {} } }, tabs: { async reload() { calls.push('reload'); } },
    scripting: { async executeScript() { return [{ result: { matches:true, owner: selected ? 'Example Engineer' : 'Other Owner', verified:selected,saveConfirmed:selected } }]; } } };
  const result = await runInNewContext(`${source}\nreloadConnectWiseSafely=async tabId=>chrome.tabs.reload(tabId);
    temporarilyPauseForeignExtensionFrames = async () => 'lease';
    restoreForeignExtensionFrames = async () => {};
    matchingFrame = async () => ({frameId:3});
    let attempts=0;
    chooseTicketOptionInTab = async () => { calls.push('choose'); if (++attempts===1) throw new Error('input.cw_ticketOwner: Example Engineer choice was not located (visible choices: none).'); choose(); };
    addSignedInTicketResource = async () => { calls.push('resource'); };
    trustedTicketSave = async () => { calls.push('save'); };
    ensureTicketOwnerInTab({tabId:7,ticketId:8000011,owner:'Example Engineer'});`,
    { chrome, calls, choose() { selected=true; }, setTimeout(callback) { callback(); } });
  assert.equal(result.verified, true);
  assert.deepEqual(calls, ['choose','resource','choose','save','reload']);
});

