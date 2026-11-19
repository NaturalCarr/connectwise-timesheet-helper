import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateEod} from '../extension/eod-model.mjs';
import {planTicket,planDay} from '../extension/plan.mjs';
const record={date:'2026-10-14',subject:'Daily update',tickets:[{titleContains:'EXAMPLE-1',status:'Completed',notes:'Work performed.'}]};
test('escalation and scheduling statuses pass ticket, daily and report validation and browser guard', () => {
  const settings = JSON.parse(readFileSync(new URL('../ticket-settings.json', import.meta.url)));
  const background = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8');
  const guard = background.slice(background.indexOf('async function setTicketStatusInTab'), background.indexOf('let found;', background.indexOf('async function setTicketStatusInTab')));
  for (const status of ['Escalate / Awaiting lead', 'Scheduling Required']) {
    assert.doesNotThrow(() => planTicket({school:'TEST',issue:'Access coordination',finalStatus:status,timeEntry:{date:'2026-11-17',start:'09:00',end:'09:15',notes:'Coordinated access.',workType:'Onsite Support',workRole:'Onsite Engineer',billable:'AUTO'}}, settings));
    assert.doesNotThrow(() => planDay({schemaVersion:'1.2',date:'2026-11-17',items:[{school:'TEST',issue:'Access coordination',finalStatus:status,timeEntries:[{date:'2026-11-17',start:'09:00',end:'09:15',notes:'Coordinated access.',workType:'Onsite Support',workRole:'Onsite Engineer',billable:'AUTO'}]}]}, settings));
    assert.doesNotThrow(() => validateEod({...record,tickets:[{...record.tickets[0],status}]}));
    assert.ok(guard.includes(`'${status}'`));
  }
});
