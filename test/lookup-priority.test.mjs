import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planTicket } from '../extension/plan.mjs';
import { executeTicket } from '../extension/execute-ticket.mjs';
import { runInNewContext } from 'node:vm';
const settings = JSON.parse(readFileSync(new URL('../ticket-settings.json', import.meta.url)));
function driver(error) {
  const calls = [];
  return { calls, async findTickets() { calls.push('title'); return [{ ticketId: 456 }]; },
    async createTicket() { throw new Error('Must not create'); },
    async openTicket(id) { calls.push(id); if (id === 123 && error) throw new Error(error); return true; },
    async ensureTicketOwner() { return true; }, async setTicketStatus() {}, async verifyTicketStatus() { return true; } };
}
test('optional school and combined references prefer number, then verified title fallback', async () => {
  const plan = planTicket({ existingTicketId: 123, titleContains: 'T-123' }, settings);
  let api = driver();
  assert.equal((await executeTicket(plan, api)).ticketId, 123);
  assert.deepEqual(api.calls, [123]);
  api = driver('Ticket #123 was not found by number.');
  assert.equal((await executeTicket(plan, api)).ticketId, 456);
  assert.deepEqual(api.calls, [123, 'title', 456]);
  api = driver('Permission denied');
  assert.equal((await executeTicket(plan, api)).ok, false);
  assert.deepEqual(api.calls, [123]);
  assert.equal(planTicket({ issue: 'Actual issue' }, settings).ticket.summary, 'Actual issue');
  assert.throws(() => planTicket({}, settings), /Issue is required/);
});
test('title lookup excludes closed matches and retains multiple open matches for ambiguity handling', async () => {
  const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const result = await runInNewContext(`${source}
    findTicketsInTab = async () => ({ok:true,matches:[{ticketId:1},{ticketId:2},{ticketId:3}]});
    openTicketInTab = async () => ({ok:true});
    inspectTicketInTab = async ({ticketId}) => ({status: ticketId===1?'Completed':'Working Issue Now',summary:'Actual title'});
    findOpenTitleTicketsInTab({tabId:7,ticket:{titleContains:'reference'}});`,
    { chrome: { runtime: { onMessage: { addListener() {} } } } });
  assert.deepEqual(Array.from(result.matches, (match) => match.ticketId), [2,3]);
});

test('title lookup waits for status hydration without reopening or creating a ticket', async () => {
  const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const result = await runInNewContext(`${source}
    let reads = 0, opens = 0;
    findTicketsInTab = async () => ({ok:true,matches:[{ticketId:123}]});
    openTicketInTab = async () => { opens++; };
    inspectTicketInTab = async () => ({status: ++reads < 4 ? null : 'Scheduled Onsite~', summary:'T-90651'});
    findOpenTitleTicketsInTab({tabId:7,ticket:{titleContains:'T-90651'}}).then(result => ({result,reads,opens}));`,
    { chrome: { runtime: { onMessage: { addListener() {} } } }, setTimeout: (fn) => fn() });
  assert.equal(result.reads, 4);
  assert.equal(result.opens, 1);
  assert.equal(result.result.matches[0].status, 'Scheduled Onsite~');
});

test('title lookup stops when status never becomes readable', async () => {
  const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  await assert.rejects(runInNewContext(`${source}
    findTicketsInTab = async () => ({ok:true,matches:[{ticketId:123}]});
    openTicketInTab = async () => {};
    inspectTicketInTab = async () => ({status:null});
    findOpenTitleTicketsInTab({tabId:7,ticket:{titleContains:'T-90651'}});`,
    { chrome: { runtime: { onMessage: { addListener() {} } } }, setTimeout: (fn) => fn() }), /status could not be read/);
});
