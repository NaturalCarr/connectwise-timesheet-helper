import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = resolve(root, 'src', 'agent-cli.mjs');

test('agent capabilities accurately report browser submission as unavailable', () => {
  const run = spawnSync(process.execPath, [cli, 'capabilities'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0);
  const output = JSON.parse(run.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.capabilities.browserSubmission, false);
});

test('agents receive parseable JSON and a failing exit code for invalid work', () => {
  const run = spawnSync(process.execPath, [cli, 'plan', '--input', '-'], {
    cwd: root, input: '{"school":"SCHB"}', encoding: 'utf8'
  });
  assert.equal(run.status, 2);
  const output = JSON.parse(run.stdout);
  assert.equal(output.ok, false);
  assert.match(output.error.message, /Issue is required/);
});

test('agents can submit an entire week as JSON over stdin', () => {
  const week = { weekStart: '2026-10-05', items: [{
    school: 'SCHB', issue: 'Copier',
    timeEntries: [{ date: '2026-10-05', start: '08:00', end: '08:15', notes: 'Checked copier',
      workType: 'Onsite Support', workRole: 'Onsite Engineer', billable: 'B' }]
  }] };
  const run = spawnSync(process.execPath, [cli, 'plan-week', '--input', '-'], {
    cwd: root, input: JSON.stringify(week), encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stdout);
  const output = JSON.parse(run.stdout);
  assert.equal(output.ok, true);
  assert.equal(output.plan.totalEntries, 1);
  assert.equal(output.plan.steps[1].action, 'set-ticket-owner-and-verify');
  assert.equal(output.plan.steps[2].action, 'set-ticket-working-and-verify');
  assert.equal(output.plan.steps[3].action, 'check-and-save-time-entry');
  assert.equal(output.plan.steps[4].action, 'set-ticket-completed-and-verify');
});

test('agents can plan a ticket without a time entry or ticket number', () => {
  const run = spawnSync(process.execPath, [cli, 'plan-ticket', '--input', '-'], {
    cwd: root, input: JSON.stringify({ school: 'SCHC', issue: 'L10 meetings' }), encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stdout);
  const output = JSON.parse(run.stdout);
  assert.equal(output.plan.ticket.summary, 'SCHC - L10 meetings');
  assert.equal(output.plan.existingTicketId, null);
  assert.deepEqual(output.plan.steps.map((step) => step.action), [
    'find-or-create-ticket', 'set-ticket-owner-and-verify', 'set-ticket-working-and-verify'
  ]);
});

test('run-week refuses example-only work before opening Brave', () => {
  const week = { schemaVersion: '1.1', weekStart: '2026-10-05', exampleOnly: true,
    items: [{ school: 'SCHE', issue: 'Example', timeEntries: [{ date: '2026-10-05',
      start: '08:00', end: '08:15', notes: 'Example only', workType: 'Onsite Support',
      workRole: 'Onsite Engineer', billable: 'B' }] }] };
  const run = spawnSync(process.execPath, [cli, 'run-week', '--input', '-'], {
    cwd: root, input: JSON.stringify(week), encoding: 'utf8'
  });
  assert.equal(run.status, 2);
  const output = JSON.parse(run.stdout);
  assert.equal(output.ok, false);
  assert.match(output.error.message, /Example-only/);
});
