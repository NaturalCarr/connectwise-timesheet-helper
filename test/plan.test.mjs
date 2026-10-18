import test from 'node:test';
import assert from 'node:assert/strict';
import { planTimeEntry, planWeek, planWorkItem, planTicket } from '../src/plan.mjs';

const settings = {
  company: 'Example', site: 'Example', contact: 'IT', board: 'Service', status: 'Working',
  completedStatus: 'Completed', type: 'Question', subtype: 'Info', owner: 'Tech', priority: 'Medium',
  agreement: 'Support', source: 'Internal'
};

test('an existing ticket is reused for one issue at one site', () => {
  const plan = planWorkItem({ school: 'SCHB', issue: 'Projector', existingTicketId: 42 }, settings);
  assert.equal(plan.action, 'use-existing-ticket');
  assert.equal(plan.ticket.summary, 'SCHB - Projector');
  assert.equal(plan.existingTicketId, 42);
  assert.equal(plan.ticket.site, 'Example');
});

test('ticket-only planning uses fixed defaults and refuses silently discarded time', () => {
  const plan = planTicket({ school: 'SCHC', issue: 'L10 meetings' }, settings);
  assert.equal(plan.ticket.summary, 'SCHC - L10 meetings');
  assert.equal(plan.ticket.description, 'SCHC - L10 meetings');
  assert.equal(plan.ticket.owner, 'Tech');
  assert.equal(plan.existingTicketId, null);
  assert.throws(() => planTicket({ school: 'SCHC', issue: 'L10 meetings',
    timeEntries: [{}] }, settings), /Date must use/);
});

test('daily ticket planning accepts exactly one time entry and chooses completion', () => {
  const timeEntry = { date: '2026-10-08', start: '11:30', end: '11:35',
    notes: 'L10 meetings', workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B' };
  const plan = planTicket({ school: 'SCHC', issue: 'L10 meetings', timeEntry }, settings);
  assert.equal(plan.timeEntry.actualHours, 0.08);
  assert.equal(plan.completeAfterTime, true);
  assert.deepEqual(plan.steps.map((step) => step.action).slice(-2),
    ['check-and-save-time-entry', 'set-ticket-completed-and-verify']);
  const working = planTicket({ school: 'SCHC', issue: 'L10 meetings', timeEntry,
    completeAfterTime: false }, settings);
  assert.equal(working.completeAfterTime, false);
  assert.equal(working.steps.at(-1).action, 'check-and-save-time-entry');
  assert.throws(() => planTicket({ school: 'SCHC', issue: 'L10 meetings',
    completeAfterTime: true }, settings), /timeEntry is required/);
  assert.throws(() => planTicket({ school: 'SCHC', issue: 'L10 meetings',
    timeEntry: { ...timeEntry, madeUpHours: 1 } }, settings), /unsupported fields: madeUpHours/);
});

test('company-wide site is fixed and an issue is required', () => {
  assert.throws(() => planWorkItem({ school: 'SCHB', issue: 'Projector' }, { ...settings, site: '' }), /Site is missing/);
  assert.throws(() => planWorkItem({ school: 'SCHB', site: 'School A', issue: 'Projector' }, settings), /Site must be Example/);
  assert.throws(() => planWorkItem({ school: 'SCHB' }, settings), /Issue is required/);
});

test('new school acronyms use the fixed ConnectWise Site', () => {
  const plan = planWorkItem({ school: 'NEWHS', issue: 'Copier' }, settings);
  assert.equal(plan.ticket.summary, 'NEWHS - Copier');
  assert.equal(plan.action, 'find-or-create-ticket');
  assert.equal(plan.existingTicketId, null);
  assert.equal(plan.ticket.site, 'Example');
});

test('one entry computes the displayed decimal hours', () => {
  const entry = planTimeEntry({ date: '2026-10-05', start: '08:15', end: '09:28',
    notes: 'Check-in with ops', workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B' });
  assert.equal(entry.actualHours, 1.22);
  assert.equal(entry.sendEmail, false);
});

test('an invalid time range cannot become a browser action', () => {
  assert.throws(() => planTimeEntry({ date: '2026-10-05', start: '16:00', end: '15:00',
    notes: 'Work', workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B' }), /End must be after/);
});

test('invalid calendar dates are rejected', () => {
  assert.throws(() => planTimeEntry({ date: '2026-02-31', start: '08:00', end: '09:00',
    notes: 'Work', workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B' }), /Date must use/);
});

test('multiline notes remain intact and ticket IDs must be integers', () => {
  const entry = planTimeEntry({ date: '2026-10-05', start: '08:00', end: '08:15',
    notes: 'Checked copier\nCleared jam', workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B' });
  assert.equal(entry.notes, 'Checked copier\nCleared jam');
  assert.throws(() => planWorkItem({ school: 'SCHB', issue: 'Copier', existingTicketId: '42' }, settings), /positive integer/);
});

const time = (date, start, end, notes) => ({
  date, start, end, notes, workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B'
});

test('a week sequences tickets and one time entry at a time without inventing records', () => {
  const plan = planWeek({ weekStart: '2026-10-05', items: [
    { school: 'SCHB', issue: 'Copier', sourceRecordIds: ['issue-1'], timeEntries: [
      { ...time('2026-10-05', '08:00', '08:15', 'Checked copier'), sourceRecordIds: ['log-1'] },
      time('2026-10-07', '10:00', '10:30', 'Replaced roller')
    ] },
    { school: 'SCHE', issue: 'Projector', existingTicketId: 42,
      timeEntries: [time('2026-10-06', '09:00', '09:30', 'Checked projector')] }
  ] }, settings);
  assert.equal(plan.weekEnd, '2026-10-11');
  assert.equal(plan.totalEntries, 3);
  assert.deepEqual(plan.steps.map((step) => step.action), [
    'find-or-create-ticket', 'set-ticket-owner-and-verify', 'set-ticket-working-and-verify',
    'check-and-save-time-entry', 'check-and-save-time-entry', 'set-ticket-completed-and-verify',
    'use-existing-ticket', 'set-ticket-owner-and-verify', 'set-ticket-working-and-verify',
    'check-and-save-time-entry', 'set-ticket-completed-and-verify'
  ]);
  assert.deepEqual(plan.tickets[0].sourceRecordIds, ['issue-1']);
  assert.deepEqual(plan.tickets[0].timeEntries[0].sourceRecordIds, ['log-1']);
});

test('a weekly plan rejects duplicate tickets, overlapping time, and wrong-week dates', () => {
  const item = { school: 'SCHB', issue: 'Copier',
    timeEntries: [time('2026-10-05', '08:00', '08:15', 'Checked copier')] };
  assert.throws(() => planWeek({ weekStart: '2026-10-05', items: [item, item] }, settings), /same ticket appears twice/);
  assert.throws(() => planWeek({ weekStart: '2026-10-05', items: [item, {
    school: 'SCHE', issue: 'Projector',
    timeEntries: [time('2026-10-05', '08:10', '08:30', 'Checked projector')]
  }] }, settings), /overlaps another entry/);
  assert.throws(() => planWeek({ weekStart: '2026-10-05', items: [
    { ...item, existingTicketId: 42 },
    { school: 'SCHE', issue: 'Projector', existingTicketId: 42,
      timeEntries: [time('2026-10-06', '08:10', '08:30', 'Checked projector')] }
  ] }, settings), /under more than one issue/);
  assert.throws(() => planWeek({ weekStart: '2026-10-05', items: [{ ...item,
    timeEntries: [time('2026-10-12', '08:00', '08:15', 'Checked copier')]
  }] }, settings), /outside/);
  assert.throws(() => planWeek({ weekStart: '2026-10-06', items: [item] }, settings), /valid Monday/);
});

test('voice record identifiers and example-only flag survive planning', () => {
  const item = { recordId: 'issue-1', school: 'SCHE', issue: 'Projector',
    context: { room: '204' }, timeEntries: [{ ...time('2026-10-06', '09:00', '09:25', 'Checked projector'),
      recordId: 'entry-1', workFacts: ['Checked cable'], outcome: 'Image restored' }] };
  const plan = planWeek({ schemaVersion: '1.1', exampleOnly: true,
    timeZone: 'America/New_York', weekStart: '2026-10-05', items: [item] }, settings);
  assert.equal(plan.exampleOnly, true);
  assert.equal(plan.tickets[0].recordId, 'issue-1');
  assert.equal(plan.tickets[0].timeEntries[0].recordId, 'entry-1');
  assert.deepEqual(plan.tickets[0].timeEntries[0].workFacts, ['Checked cable']);
  assert.throws(() => planWeek({ weekStart: '2026-10-05', items: [{ ...item,
    timeEntries: [{ ...item.timeEntries[0], recordId: 'issue-1' }] }] }, settings), /Duplicate recordId/);
});

test('time entry status must remain working until completion', () => {
  const item = { school: 'SCHE', issue: 'Projector', timeEntries: [
    { ...time('2026-10-06', '09:00', '09:25', 'Checked projector'), ticketStatus: 'Completed' }
  ] };
  assert.throws(() => planWeek({ weekStart: '2026-10-05', items: [item] }, settings), /must be Working/);
  const plan = planWeek({ weekStart: '2026-10-05', items: [{ ...item,
    timeEntries: [time('2026-10-06', '09:00', '09:25', 'Checked projector')] }] }, settings);
  assert.equal(plan.tickets[0].timeEntries[0].ticketStatus, 'Working');
  assert.equal(plan.steps.at(-1).status, 'Completed');
});

