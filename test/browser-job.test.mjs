import test from 'node:test';
import assert from 'node:assert/strict';
import { runBrowserJob, runTicketBrowserJob } from '../src/browser-job.mjs';

test('local browser bridge sends only a non-example plan to its extension and returns verification', async () => {
  const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
  const origin = `chrome-extension://${extensionId}`;
  const plan = { exampleOnly: false, tickets: [{ ticket: { summary: 'SCHE - Copier' } }] };
  const result = await runBrowserJob(plan, { extensionId, launchBrowser: async (runnerUrl) => {
    const hash = new URLSearchParams(new URL(runnerUrl).hash.slice(1));
    const base = `http://127.0.0.1:${hash.get('port')}`;
    const token = hash.get('token');
    const blocked = await fetch(`${base}/job?token=${token}`);
    assert.equal(blocked.status, 403);
    const job = await fetch(`${base}/job?token=${token}`, { headers: { Origin: origin } });
    assert.equal(job.status, 200);
    assert.deepEqual((await job.json()).plan, plan);
    const posted = await fetch(`${base}/result?token=${token}`, {
      method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, results: [{ ticketId: 123, status: 'completed_verified' }] })
    });
    assert.equal(posted.status, 204);
  } });
  assert.equal(result.ok, true);
  assert.equal(result.results[0].status, 'completed_verified');
});

test('local browser bridge rejects example-only work', async () => {
  await assert.rejects(runBrowserJob({ exampleOnly: true, tickets: [] },
    { extensionId: 'abcdefghijklmnopabcdefghijklmnop', launchBrowser() {} }), /Example|non-example/i);
});

test('ticket-only jobs use the ticket runner and return its verified result', async () => {
  const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
  const origin = `chrome-extension://${extensionId}`;
  const plan = { exampleOnly: false, ticket: { summary: 'SCHC - L10 meetings' } };
  const result = await runTicketBrowserJob(plan, { extensionId, launchBrowser: async (runnerUrl) => {
    assert.equal(new URL(runnerUrl).pathname, '/ticket-runner.html');
    const hash = new URLSearchParams(new URL(runnerUrl).hash.slice(1));
    const base = `http://127.0.0.1:${hash.get('port')}`;
    const headers = { Origin: origin, 'Content-Type': 'application/json' };
    const job = await fetch(`${base}/job?token=${hash.get('token')}`, { headers });
    assert.equal((await job.json()).plan.ticket.summary, 'SCHC - L10 meetings');
    await fetch(`${base}/result?token=${hash.get('token')}`, { method: 'POST', headers,
      body: JSON.stringify({ ok: true, ticketId: 333, status: 'created_verified' }) });
  } });
  assert.equal(result.ticketId, 333);
});
