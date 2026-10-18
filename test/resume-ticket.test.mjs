import test from 'node:test';
import assert from 'node:assert/strict';
import { executeTicket } from '../extension/execute-ticket.mjs';
const plan = { ticket: { summary: 'School - Issue', status: 'Working Issue Now', owner: 'User' },
  completeAfterTime: true, completedStatus: 'Completed', timeEntry: { date: '2026-10-14', start: '09:00', end: '10:00', notes: 'Actual work' } };
const checkpoint = { ticketId: 123, entry: { ...plan.timeEntry, status: 'saved_verified' } };
function driver(matches = [{}]) {
  const calls = [];
  const api = Object.fromEntries(['findTickets','createTicket','ensureTicketOwner','openNewTimeEntry','fillTimeEntry','verifyTimeDraft','saveTimeEntry'].map((key) => [key, async () => { throw new Error(`Unexpected ${key}`); }]));
  Object.assign(api, { async openTicket(id, _ticket, lookup) { calls.push(['open', id, lookup.numberOnly]); return true; },
    async findTimeEntries() { return matches; }, async verifyTimeEntry() { return { verified: true }; },
    async setTicketStatus(_id, status) { calls.push(['status', status]); }, async verifyTicketStatus() { return true; } });
  return { api, calls };
}
test('resume of saved time rechecks the row and only retries final status', async () => {
  const { api, calls } = driver();
  const result = await executeTicket(plan, api, checkpoint);
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [['open', 123, true], ['status', 'Completed']]);
});
test('resume refuses missing or duplicate time instead of repeating Save', async () => {
  for (const matches of [[], [{}, {}]]) {
    const { api, calls } = driver(matches);
    const result = await executeTicket(plan, api, checkpoint);
    assert.equal(result.ok, false); assert.match(result.error, /reconciliation/);
    assert.deepEqual(calls, [['open', 123, true]]);
  }
});
