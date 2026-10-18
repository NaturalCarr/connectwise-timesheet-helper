import test from 'node:test';
import assert from 'node:assert/strict';
import { planTicket } from '../extension/plan.mjs';
import { executeTicket } from '../extension/execute-ticket.mjs';
import { readFileSync } from 'node:fs';
const settings = JSON.parse(readFileSync(new URL('../ticket-settings.json', import.meta.url)));
const input = { issue: 'Actual issue', existingTicketId: 123, finalStatus: 'Completed', timeEntries: [
  { date: '2026-10-15', start: '09:00', end: '09:30', notes: 'First work', workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'AUTO' },
  { date: '2026-10-15', start: '10:00', end: '10:30', notes: 'Second work', workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'AUTO' }
] };
test('multiple GUI entries save one at a time and final status follows the last verification', async () => {
  const plan = planTicket(input, settings); const calls = []; const saved = new Set(); let fail = true;
  const driver = { async findTickets() { throw new Error('No search needed'); }, async createTicket() { throw new Error('No creation needed'); },
    async openTicket() { return true; }, async ensureTicketOwner() { return true; },
    async setTicketStatus(_id, status) { calls.push(status); }, async verifyTicketStatus() { return true; },
    async findTimeEntries(_id, entry) { return saved.has(entry.start) ? [{timeId:1}] : []; },
    async openNewTimeEntry() { return true; }, async fillTimeEntry(_id, entry) { if (entry.start === '10:00' && fail) { fail=false; throw new Error('Transient picker'); } },
    async verifyTimeDraft() { return true; }, async saveTimeEntry(_id, entry) { saved.add(entry.start); calls.push(`save ${entry.start}`); },
    async verifyTimeEntry(_id, entry) { calls.push(`verify ${entry.start}`); return {verified:true}; } };
  const stopped = await executeTicket(plan, driver);
  assert.equal(stopped.ok, false); assert.equal(stopped.entries.length, 2);
  assert.equal(calls.includes('Completed'), false);
  const result = await executeTicket(plan, driver, stopped);
  assert.equal(result.ok, true); assert.equal(result.entries.length, 2);
  assert.equal(calls.filter((value) => value === 'save 09:00').length, 1);
  assert.ok(calls.indexOf('Completed') > calls.indexOf('verify 10:00'));
  const bad = structuredClone(input); bad.timeEntries[1].start = '09:15';
  assert.throws(() => planTicket(bad, settings), /overlap/);
});
