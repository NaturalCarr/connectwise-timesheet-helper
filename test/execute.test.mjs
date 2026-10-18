import test from 'node:test';
import assert from 'node:assert/strict';
import { executePlan } from '../src/execute.mjs';

const entry = { recordId: 'time-1', date: '2026-10-06', start: '09:00', end: '09:30',
  notes: 'Actual work', ticketStatus: 'Working Issue Now' };
const plan = { exampleOnly: false, tickets: [{ recordId: 'issue-1', existingTicketId: null,
  ticket: { company: 'Example Public Schools', site: 'Example Public Schools',
    summary: 'SCHE - Projector', owner: 'Example Engineer', status: 'Working Issue Now' },
  completedStatus: 'Completed', timeEntries: [entry] }] };

function driver(calls, overrides = {}) {
  const base = {
    async findTickets() { calls.push('search'); return []; },
    async createTicket() { calls.push('create'); return 42; },
    async openTicket() { calls.push('open'); return true; },
    async ensureTicketOwner(_id, owner) { calls.push(`owner:${owner}`); return true; },
    async setTicketStatus(_id, status) { calls.push(`set:${status}`); },
    async verifyTicketStatus(_id, status) { calls.push(`verify:${status}`); return true; },
    async findTimeEntries() { calls.push('check-time'); return []; },
    async openNewTimeEntry() { calls.push('new-time'); return true; },
    async fillTimeEntry() { calls.push('fill-time'); },
    async verifyTimeDraft() { calls.push('verify-draft'); return true; },
    async saveTimeEntry() { calls.push('save-time'); },
    async verifyTimeEntry() { calls.push('verify-time'); return { verified: true, timeId: 9 }; }
  };
  return { ...base, ...overrides };
}

test('ticket is completed only after each time entry is saved and verified', async () => {
  const calls = [];
  const result = await executePlan(plan, driver(calls));
  assert.equal(result.ok, true);
  assert.equal(result.results[0].status, 'completed_verified');
  assert.deepEqual(calls, ['search', 'create', 'open', 'owner:Example Engineer', 'set:Working Issue Now',
    'verify:Working Issue Now', 'check-time', 'new-time', 'fill-time',
    'verify-draft', 'save-time', 'verify-time', 'set:Completed', 'verify:Completed']);
});

test('time is not entered until saved ticket ownership is verified', async () => {
  const calls = [];
  const result = await executePlan(plan, driver(calls, {
    async ensureTicketOwner() { calls.push('owner-failed'); return false; }
  }));
  assert.equal(result.ok, false);
  assert.equal(result.results[0].ticketId, 42);
  assert.equal(result.results[0].status, 'stopped');
  assert.deepEqual(calls, ['search', 'create', 'open', 'owner-failed']);
});

test('failed time verification stops before completion', async () => {
  const calls = [];
  const result = await executePlan(plan, driver(calls, {
    async verifyTimeEntry() { calls.push('verify-time'); return { verified: false }; }
  }));
  assert.equal(result.ok, false);
  assert.equal(result.results[0].status, 'stopped');
  assert.equal(calls.includes('set:Completed'), false);
});

test('an existing time entry is reused before saving the next entry', async () => {
  const calls = [];
  const second = { ...entry, recordId: 'time-2', start: '10:00', end: '10:30', notes: 'More actual work' };
  const twoEntryPlan = { ...plan, tickets: [{ ...plan.tickets[0], timeEntries: [entry, second] }] };
  const result = await executePlan(twoEntryPlan, driver(calls, {
    async findTimeEntries(_id, candidate) {
      calls.push(`check-time:${candidate.recordId}`);
      return candidate.recordId === 'time-1' ? [{ timeId: 17 }] : [];
    }
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.results[0].entries.map((item) => item.status),
    ['existing_verified', 'saved_verified']);
  assert.equal(calls.filter((call) => call === 'save-time').length, 1);
  assert.equal(calls.at(-1), 'verify:Completed');
});

test('example work and ambiguous ticket matches cannot be submitted', async () => {
  await assert.rejects(executePlan({ ...plan, exampleOnly: true }, driver([])), /Example-only/);
  const calls = [];
  const result = await executePlan(plan, driver(calls, {
    async findTickets() { calls.push('search'); return [{ ticketId: 1 }, { ticketId: 2 }]; }
  }));
  assert.equal(result.ok, false);
  assert.deepEqual(calls, ['search']);
});
