import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTicket } from '../extension/execute-ticket.mjs';

const plan = { exampleOnly: false, existingTicketId: null, recordId: 'issue-1',
  ticket: { summary: 'SCHC - L10 meetings', owner: 'Example Engineer', status: 'Working Issue Now' } };
const timePlan = { ...plan, completedStatus: 'Completed', completeAfterTime: true,
  timeEntry: { recordId: 'time-1', date: '2026-10-08', start: '11:30', end: '11:35', notes: 'L10 meetings' } };

function driver(calls, overrides = {}) {
  return {
    async findTickets() { calls.push('search'); return []; },
    async createTicket() { calls.push('create'); return 101; },
    async openTicket() { calls.push('open'); return true; },
    async ensureTicketOwner() { calls.push('owner'); return true; },
    async setTicketStatus() { calls.push('set-status'); },
    async verifyTicketStatus() { calls.push('verify-status'); return true; },
    async findTimeEntries() { calls.push('check-time'); return []; },
    async openNewTimeEntry() { calls.push('new-time'); return true; },
    async fillTimeEntry() { calls.push('fill-time'); },
    async verifyTimeDraft() { calls.push('verify-draft'); return true; },
    async saveTimeEntry() { calls.push('save-time'); },
    async verifyTimeEntry() { calls.push('verify-time'); return { verified: true, timeId: 44 }; },
    ...overrides
  };
}

test('ticket-only run stops after verified ticket ownership and working status', async () => {
  const calls = [];
  const result = await executeTicket(plan, driver(calls));
  assert.equal(result.ok, true);
  assert.equal(result.ticketId, 101);
  assert.equal(result.status, 'created_verified');
  assert.deepEqual(calls, ['search', 'create', 'open', 'owner', 'set-status', 'verify-status']);
});

test('daily run saves one time entry before completing the ticket', async () => {
  const calls = [];
  const result = await executeTicket(timePlan, driver(calls));
  assert.equal(result.ok, true);
  assert.equal(result.status, 'completed_verified');
  assert.equal(result.entry.status, 'saved_verified');
  assert.equal(result.entry.timeId, 44);
  assert.equal(result.ticketStatus, 'Completed');
  assert.deepEqual(calls, ['search', 'create', 'open', 'owner', 'set-status', 'verify-status',
    'check-time', 'new-time', 'fill-time', 'verify-draft', 'save-time', 'verify-time',
    'set-status', 'verify-status']);
});

test('daily run can leave a verified time entry on a working ticket', async () => {
  const calls = [];
  const result = await executeTicket({ ...timePlan, completeAfterTime: false }, driver(calls));
  assert.equal(result.status, 'working_with_time_verified');
  assert.equal(result.ticketStatus, 'Working Issue Now');
  assert.equal(calls.filter((call) => call === 'set-status').length, 1);
});

test('failed time verification stops before ticket completion', async () => {
  const calls = [];
  const result = await executeTicket(timePlan, driver(calls, {
    async verifyTimeEntry() { calls.push('verify-time'); return { verified: false }; }
  }));
  assert.equal(result.ok, false);
  assert.equal(result.entry.status, 'pending');
  assert.equal(calls.filter((call) => call === 'set-status').length, 1);
});

test('an identical saved time row is reused instead of submitted twice', async () => {
  const calls = [];
  const result = await executeTicket(timePlan, driver(calls, {
    async findTimeEntries() { calls.push('check-time'); return [{ timeId: 55 }]; }
  }));
  assert.equal(result.ok, true);
  assert.equal(result.entry.status, 'existing_verified');
  assert.equal(result.entry.timeId, 55);
  assert.equal(calls.includes('save-time'), false);
});

test('an exact existing ticket is reused', async () => {
  const calls = [];
  const result = await executeTicket(plan, driver(calls, {
    async findTickets() { calls.push('search'); return [{ ticketId: 202 }]; }
  }));
  assert.equal(result.ok, true);
  assert.equal(result.ticketId, 202);
  assert.equal(result.status, 'existing_verified');
  assert.equal(calls.includes('create'), false);
});

test('a saved ticket ID survives a stopped post-save verification', async () => {
  const calls = [];
  const result = await executeTicket(plan, driver(calls, {
    async createTicket() {
      calls.push('create');
      const error = new Error('Ticket #8000001 was created, but its fields were not verified.');
      error.ticketId = 8000001;
      throw error;
    }
  }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 'stopped');
  assert.equal(result.ticketId, 8000001);
  assert.deepEqual(calls, ['search', 'create']);
});

test('ambiguous search and failed owner verification stop before later writes', async () => {
  const calls = [];
  const ambiguous = await executeTicket(plan, driver(calls, {
    async findTickets() { calls.push('search'); return [{ ticketId: 1 }, { ticketId: 2 }]; }
  }));
  assert.equal(ambiguous.ok, false);
  assert.deepEqual(calls, ['search']);
  const afterCreate = [];
  const ownerFailed = await executeTicket(plan, driver(afterCreate, {
    async ensureTicketOwner() { afterCreate.push('owner-failed'); return false; }
  }));
  assert.equal(ownerFailed.ticketId, 101);
  assert.equal(ownerFailed.status, 'stopped');
  assert.equal(afterCreate.includes('set-status'), false);
});
