import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planDay, planWeek } from '../extension/plan.mjs';
import { dailyReport, reportsByDay } from '../extension/daily-report.mjs';
const settings = JSON.parse(readFileSync(new URL('../ticket-settings.json', import.meta.url)));
const example = JSON.parse(readFileSync(new URL('../examples/daily.example.json', import.meta.url)));
test('daily planning retains requested statuses and rejects out-of-day or overlapping time', () => {
  const plan = planDay(example, settings);
  assert.equal(plan.exampleOnly, true); assert.equal(plan.mode, 'daily');
  assert.equal(plan.tickets[0].completedStatus, 'Waiting Parts/Repair');
  const wrongDay = structuredClone(example); wrongDay.items[0].timeEntries[0].date = '2026-10-15';
  assert.throws(() => planDay(wrongDay, settings), /daily date/);
  const overlap = structuredClone(example); overlap.items[1].timeEntries[0].start = '09:15';
  assert.throws(() => planDay(overlap, settings), /overlaps/);
});

test('weekly report groups each date without leaking notes between days', () => {
  const input = { schemaVersion: '1.1', weekStart: '2026-10-12', items: [
    { school: 'SCHC', issue: 'Issue', timeEntries: [
      { date: '2026-10-14', start: '09:00', end: '10:00', workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'AUTO', notes: 'Wednesday work', followUp: 'Wednesday followup' },
      { date: '2026-10-13', start: '09:00', end: '10:00', workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'AUTO', notes: 'Tuesday work', followUp: 'Tuesday followup' }
    ] }
  ] };
  const plan = planWeek(input, settings);
  const execution = { ok: true, results: [{ ticketId: 123, summary: 'Actual title', ticketStatus: 'Completed',
    entries: [{ status: 'saved_verified' }, { status: 'existing_verified' }] }] };
  const reports = reportsByDay(plan, execution);
  assert.deepEqual(reports.map((report) => report.date), ['2026-10-13', '2026-10-14']);
  assert.match(reports[0].html, /Tuesday work/);
  assert.doesNotMatch(reports[0].html, /Wednesday/);
  assert.match(reports[1].html, /Wednesday followup/);
  assert.throws(() => reportsByDay(plan, { ...execution, ok: false }), /every ticket/);
});
test('daily email uses verified IDs and statuses and blocks incomplete runs', () => {
  const plan = planDay(example, settings);
  const execution = { ok: true, results: plan.tickets.map((item, index) => ({ ticketId: 100 + index,
    summary: 'Actual saved title', ticketStatus: item.completedStatus, entries: [{ status: 'saved_verified' }] })) };
  const report = dailyReport(plan, execution);
  assert.match(report.html, /Actual saved title/);
  assert.match(report.html, /Waiting Parts\/Repair/);
  assert.throws(() => dailyReport(plan, { ...execution, ok: false }), /every ticket/);
  execution.results[0].entries[0].status = 'pending';
  assert.throws(() => dailyReport(plan, execution), /unverified/);
});

