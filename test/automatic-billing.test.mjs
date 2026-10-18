import test from 'node:test';
import assert from 'node:assert/strict';
import { planTimeEntry } from '../extension/plan.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
test('automatic billing preserves ConnectWise choice and recognizes saved billing codes', () => {
  const entry = planTimeEntry({ date: '2026-10-14', start: '09:00', end: '09:15',
    workType: 'Onsite Support', workRole: 'Onsite Engineer', notes: 'Actual notes', billable: 'AUTO' });
  assert.equal(entry.billable, 'AUTO');
  const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const matches = runInNewContext(`${source}\ntimeRowMatchesEntryFields`, {
    chrome: { runtime: { onMessage: { addListener() {} } } } });
  const row = { workType: '$Onsite Support', workRole: '$Onsite Engineer', billable: 'NB' };
  assert.equal(matches(row, entry), true);
  assert.equal(matches({ ...row, billable: 'unreadable' }, entry), false);
});
