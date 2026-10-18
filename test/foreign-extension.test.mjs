import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
const blocked = 'Cannot access a chrome-extension:// URL of different extension';

function fixture({ scanFailsAgain = false, attachFailsAgain = false } = {}) {
  const calls = [];
  let scans = 0;
  let attaches = 0;
  const chrome = {
    runtime: { id: 'helper', onMessage: { addListener() {} } },
    tabs: { async get() { return { url: 'https://na.myconnectwise.net/ConnectWise.aspx' }; } },
    scripting: { async executeScript({ func, target }) {
      if (func.name === 'pauseForeignExtensionFrames') {
        calls.push('park');
        assert.deepEqual(Array.from(target.frameIds), [0]);
        return [{ result: { leaseId: 'fixture-lease', parked: 1 } }];
      }
      if (func.name === 'resumeForeignExtensionFrames') { calls.push('restore'); return [{ result: { restored: 1 } }]; }
      calls.push('scan');
      if (++scans === 1 || scanFailsAgain) throw new Error(blocked);
      return [{ frameId: 3, result: { matches: true } }];
    } },
    debugger: { async attach() {
      calls.push('attach');
      if (++attaches === 1 || attachFailsAgain) throw new Error(blocked);
    } }
  };
  return { chrome, calls, setTimeout(callback) { callback(); } };
}

test('a protected frame scan is retried once with popup frames parked and restored', async () => {
  const context = fixture();
  const result = await runInNewContext(`${source}\nexecuteConnectWiseScript({
    target: { tabId: 7, allFrames: true }, func: inspectTicketFrame, args: ['8000009']
  })`, context);
  assert.equal(result[0].frameId, 3);
  assert.deepEqual(context.calls, ['scan', 'park', 'scan', 'restore']);
});

test('popup frames are restored even when the repeated scan fails', async () => {
  const context = fixture({ scanFailsAgain: true });
  await assert.rejects(runInNewContext(`${source}\nexecuteConnectWiseScript({
    target: { tabId: 7, allFrames: true }, func: inspectTicketFrame
  })`, context), /Cannot access/);
  assert.deepEqual(context.calls, ['scan', 'park', 'scan', 'restore']);
});

test('a blocked debugger retry restores popup frames and reports that no click was sent', async () => {
  const context = fixture({ attachFailsAgain: true });
  await assert.rejects(runInNewContext(`${source}\nattachConnectWiseDebugger({ tabId: 7 })`, context), /No click was sent/);
  assert.deepEqual(context.calls, ['attach', 'park', 'attach', 'restore']);
});
