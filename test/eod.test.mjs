import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEod, renderEod } from '../extension/eod-model.mjs';
import { planTicket } from '../extension/plan.mjs';
import { executeTicket } from '../extension/execute-ticket.mjs';
import { readFileSync } from 'node:fs';
const record = { date: '2026-10-14', subject: 'Daily update', tickets: [
  { titleContains: 'T-52463', status: 'Waiting Client Response', notes: '<script>work</script>', nextStep: 'Follow up' }] };
test('end-of-day report requires saved statuses and escapes supplied work text', () => {
  assert.throws(() => renderEod(record, []), /Every ticket/);
  const html = renderEod(record, [{ verified: true, ticketId: 123, status: 'Waiting Client Response', summary: 'Actual ticket' }]);
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Actual ticket/);
  assert.throws(() => validateEod({ ...record, tickets: [record.tickets[0], record.tickets[0]] }), /more than once/);
});
test('title lookup creates a referenced ticket after a verified empty search', async () => {
  const settings = JSON.parse(readFileSync(new URL('../ticket-settings.json', import.meta.url)));
  const plan = planTicket({ school: 'DPHES', issue: 'Known issue', titleContains: 'T-52463' }, settings);
  const driver = Object.fromEntries(['createTicket','openTicket','ensureTicketOwner','setTicketStatus','verifyTicketStatus'].map((key) => [key, async () => { throw new Error('unexpected browser operation'); }]));
  driver.findTickets = async () => [];
  driver.createTicket = async () => 777;
  driver.openTicket = async () => true;
  driver.ensureTicketOwner = async () => true;
  driver.setTicketStatus = async () => {};
  driver.verifyTicketStatus = async () => true;
  const result = await executeTicket(plan, driver);
  assert.equal(result.ok, true);
  assert.equal(result.ticketId, 777);
  assert.match(plan.ticket.summary, /T-52463/);
  assert.equal(plan.ticket.titleContains, 'T-52463');
});


test('email table omits ConnectWise IDs and gives every cell an inline border', () => {
  const html = renderEod(record, [{verified:true,ticketId:1728150,status:'Waiting Client Response',summary:'Staff Mac setup - T-52672'}]);
  assert.doesNotMatch(html,/1728150/);
  assert.match(html,/T-52672/);
  assert.equal((html.match(/<(?:td|th) style="border:1px solid #444/g)||[]).length,8);
});

test('DITL titles retain work notes regardless of capitalization', () => {
  for (const summary of ['School - DITL - daily', 'School - ditl', 'DiTl daily']) {
    const html=renderEod(record,[{verified:true,ticketId:123,status:'Waiting Client Response',summary}]);
    assert.match(html,/<tbody><tr>/);
    assert.match(html,/&lt;script&gt;/);
  }
  const html=renderEod(record,[{verified:true,ticketId:123,status:'Waiting Client Response',summary:'School DITLogger'}]);
  assert.match(html,/School DITLogger/);
});
