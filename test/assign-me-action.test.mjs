import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');

test('Assign Me is located on the correct saved ticket and scrolled into view', () => {
  let scrolled = false;
  const button = {
    children: [], textContent: 'ASSIGN ME',
    getBoundingClientRect: () => ({ left: 120, top: 220, width: 80, height: 24 }),
    scrollIntoView() { scrolled = true; }
  };
  const document = {
    body: { innerText: 'Service Ticket #8000001 - SCHD - Repeat Jams' },
    querySelectorAll() { return [button]; }
  };
  const window = { innerWidth: 800, innerHeight: 600 };
  window.top = window;
  const chrome = { runtime: { onMessage: { addListener() {} } } };
  const point = runInNewContext(`${source}\nlocateTicketAction(8000001, 'assign-me')`,
    { chrome, document, window });
  assert.equal(scrolled, true);
  assert.equal(point.found, true);
  assert.equal(point.x, 160);
  assert.equal(point.y, 232);
  assert.throws(() => runInNewContext(`${source}\nlocateTicketAction(8000002, 'assign-me')`,
    { chrome, document, window }), /not open/);
});
