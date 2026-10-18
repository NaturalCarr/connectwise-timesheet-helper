import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/form-functions.js', import.meta.url), 'utf8');

function detect(chargeTo, requestedId) {
  const input = {
    value: chargeTo,
    getBoundingClientRect() { return { width: 100, height: 20 }; }
  };
  const context = {
    document: {
      querySelectorAll(selector) { return selector === 'input.cw_ChargeToTextBox' ? [input] : []; },
      querySelector() { return {}; }
    },
    getComputedStyle() { return { display: 'block', visibility: 'visible' }; }
  };
  return runInNewContext(`${source}\ndetectTimeFrame(${JSON.stringify(requestedId)})`, context);
}

test('the popup obtains the ConnectWise assigned ticket number from Charge To', () => {
  const result = detect('Example Public Schools / 8000007 - SCHB Ticket -52099');
  assert.equal(result.matches, true);
  assert.equal(result.ticketId, '8000007');
  assert.equal(detect('Example Public Schools / 8000007 - SCHB', '8000007').matches, true);
  assert.equal(detect('Example Public Schools / 8000007 - SCHB', '8000006').matches, false);
});

test('an unreadable ticket number cannot be used for a time draft', () => {
  const result = detect('Example Public Schools / SCHB - Copier');
  assert.equal(result.isTimeForm, true);
  assert.equal(result.matches, false);
  assert.equal(result.ticketId, null);
});
