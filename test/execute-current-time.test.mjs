import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCurrentTime } from '../extension/execute-current-time.mjs';

function driver(calls, matches = []) {
  return {
    async identifyCurrentTicket() { calls.push('identify'); return { ticketId: 42 }; },
    async verifyCompanySite() { calls.push('company-site'); },
    async setTicketStatus(_id, status) { calls.push(`set:${status}`); },
    async verifyTicketStatus(_id, status) { calls.push(`verify:${status}`); return true; },
    async findTimeEntries() { calls.push('duplicate-check'); return matches; },
    async openNewTimeEntry() { calls.push('new-time'); },
    async prepareTimeDraft() { calls.push('prepare'); return { frameId: 7 }; },
    async verifyTimeDraft() { calls.push('verify-draft'); return true; },
    async saveTimeEntry() { calls.push('save-time'); },
    async verifyTimeEntry() { calls.push('verify-row'); return { verified: true }; }
  };
}

const entry = { date: '2026-10-08', start: '11:30', end: '11:35', notes: 'Actual work' };

test('current ticket time is checked, saved, verified, then optionally completed', async () => {
  const calls = [];
  const result = await executeCurrentTime(entry, true, driver(calls));
  assert.equal(result.ok, true);
  assert.equal(result.ticketId, 42);
  assert.equal(result.entry.status, 'saved_verified');
  assert.deepEqual(calls, ['identify', 'company-site', 'duplicate-check', 'set:Working Issue Now',
    'verify:Working Issue Now', 'new-time', 'prepare',
    'verify-draft', 'save-time', 'verify-row', 'set:Completed', 'verify:Completed']);
});

test('existing time is reused and the ticket completes when requested', async () => {
  const calls = [];
  const result = await executeCurrentTime(entry, true, driver(calls, [{}]));
  assert.equal(result.status, 'completed_verified');
  assert.equal(result.entry.status, 'existing_verified');
  assert.equal(calls.includes('save-time'), false);
  assert.equal(calls.includes('set:Working Issue Now'), false);
  assert.equal(calls.includes('set:Completed'), true);
});

test('existing time leaves the ticket alone when completion is not requested', async () => {
  const calls = [];
  const result = await executeCurrentTime(entry, false, driver(calls, [{}]));
  assert.equal(result.status, 'existing_verified');
  assert.equal(calls.includes('save-time'), false);
  assert.equal(calls.includes('set:Completed'), false);
});

test('unverified saved row stops before completion', async () => {
  const calls = [];
  const browser = driver(calls);
  browser.verifyTimeEntry = async () => ({ verified: false });
  const result = await executeCurrentTime(entry, true, browser);
  assert.equal(result.ok, false);
  assert.match(result.error, /saved Time row was not verified/);
  assert.equal(calls.includes('set:Completed'), false);
});
