import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { executeTicket } from '../extension/execute-ticket.mjs';
import { executePlan } from '../extension/execute-plan.mjs';

const source = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
const chrome = { runtime: { onMessage: { addListener() {} } } };

test('an explicit number accepts the opened ticket despite different summary, company, and site', async () => {
  const result = await runInNewContext(`${source}
    connectwiseTab = async () => {};
    inspectTicketInTab = async () => ({ ticketId: 8000009, summary: 'Actual title',
      company: 'Actual company', site: 'Actual site' });
    findTicketsInTab = async () => { throw new Error('Title search must not run'); };
    openTicketInTab({ tabId: 7, ticketId: 8000009, numberOnly: true,
      ticket: { summary: 'SCHD - GoTo', company: 'Different company', site: 'Different site' } })`, { chrome });
  assert.equal(result.verified, true);
  assert.equal(result.ticketId, 8000009);
});

test('an unopened explicit ID uses number search and cannot fall back to title search', async () => {
  const calls = [];
  const result = await runInNewContext(`${source}
    connectwiseTab = async () => {};
    let reads = 0;
    inspectTicketInTab = async () => {
      if (++reads === 1) throw new Error('Ticket is not open');
      return { ticketId: 8000009, summary: 'Actual title', company: 'Actual company', site: 'Actual site' };
    };
    findTicketsInTab = async () => { throw new Error('Title search must not run'); };
    findTicketNumberInTab = async (_tabId, ticketId) => {
      calls.push(ticketId); return { matches: [{ ticketId }] };
    };
    openTicketInTab({ tabId: 7, ticketId: 8000009, numberOnly: true,
      ticket: { summary: 'SCHD - GoTo', company: 'Other', site: 'Other' } })`, { chrome, calls });
  assert.equal(result.verified, true);
  assert.deepEqual(calls, [8000009]);
});

test('a number search cannot open a different result', async () => {
  await assert.rejects(runInNewContext(`${source}
    connectwiseTab = async () => {};
    inspectTicketInTab = async () => { throw new Error('Expected ticket not open'); };
    findTicketNumberInTab = async () => ({ matches: [{ ticketId: 8000012 }] });
    openTicketInTab({ tabId: 7, ticketId: 8000009, numberOnly: true })`, { chrome }), /not found by number/);
});

test('number lookup clears other filters and accepts the exact ID regardless of row metadata', () => {
  class Input {
    constructor(id, value) { this.id = id; this.value = value; }
    get value() { return this.currentValue; }
    set value(value) { this.currentValue = value; }
    getBoundingClientRect() { return { width: 100, height: 20 }; }
    getAttribute() { return ''; }
    closest() { return null; }
    dispatchEvent() {}
  }
  const inputs = [new Input('SR_Service_RecID-input', ''), new Input('Summary-input', '*SCHD - GoTo*'),
    new Input('Company_Name-input', 'Wrong company'), new Input('Site_name-input', 'Wrong site')];
  let searched = false;
  const clear = { getBoundingClientRect: () => ({ width: 20, height: 20 }), click() {} };
  const search = { ...clear, click() { searched = true; } };
  const row = { children: ['', '8000009', '', '', '', '', 'Actual ticket title', '', 'Actual company', 'Actual site']
    .map((innerText) => ({ tagName: 'TD', innerText })) };
  const document = { body: { innerText: 'View 1 - 1 of 1' }, querySelectorAll(selector) {
    if (selector === 'input[id$="-input"]') return inputs;
    if (selector === '.cw-toolbar-clear') return [clear];
    if (selector === '.cw-toolbar-search') return [search];
    if (selector === 'tr') return [row];
    return [];
  } };
  class Event { constructor(type) { this.type = type; } }
  const context = { chrome, document, HTMLInputElement: Input, Event, InputEvent: Event };
  const start = runInNewContext(`${source}\nboardTicketNumber(8000009, 'search')`, context);
  assert.equal(searched, true);
  assert.equal(start.filterId, 'SR_Service_RecID-input');
  assert.deepEqual(inputs.map((input) => input.value), ['8000009', '', '', '']);
  const result = runInNewContext(`${source}\nboardTicketNumber(8000009, 'inspect', 'SR_Service_RecID-input')`, context);
  assert.equal(result.ready, true);
  assert.equal(result.matches[0].ticketId, 8000009);
  row.children[1].innerText = '8000012';
  assert.equal(runInNewContext(`${source}\nboardTicketNumber(8000009, 'inspect', 'SR_Service_RecID-input')`, context).ready, false);
});

test('daily and weekly jobs pass number-only lookup only for an explicit existing ID', async () => {
  const calls = [];
  const ticket = { summary: 'SCHD - GoTo', company: 'Default', site: 'Default', owner: 'Example Engineer', status: 'Working Issue Now' };
  const driver = {
    async findTickets() { return [{ ticketId: 8000009 }]; },
    async createTicket() { throw new Error('Unexpected create'); },
    async openTicket(id, _ticket, lookup) { calls.push({ id, numberOnly: lookup.numberOnly }); return true; },
    async ensureTicketOwner() { return true; }, async setTicketStatus() {}, async verifyTicketStatus() { return true; },
    async findTimeEntries() { return []; }, async openNewTimeEntry() {}, async fillTimeEntry() {},
    async verifyTimeDraft() {}, async saveTimeEntry() {}, async verifyTimeEntry() {}
  };
  assert.equal((await executeTicket({ ticket, existingTicketId: 8000009 }, driver)).ok, true);
  assert.equal((await executeTicket({ ticket }, driver)).ok, true);
  assert.equal((await executePlan({ tickets: [{ ticket, existingTicketId: 8000009,
    timeEntries: [], completedStatus: 'Completed' }] }, driver)).ok, true);
  assert.deepEqual(calls, [{ id: 8000009, numberOnly: true }, { id: 8000009, numberOnly: false },
    { id: 8000009, numberOnly: true }]);
});
