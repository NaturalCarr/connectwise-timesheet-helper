import test from 'node:test';
import assert from 'node:assert/strict';
import { requireTicketOwner, applyTicketOwner, ownerKey } from '../extension/owner-settings.mjs';

test('owner setup is required and does not invent a default', async () => {
  await assert.rejects(requireTicketOwner({ async get() { return {}; } }), /Enter and save Ticket Owner/);
  assert.equal(await requireTicketOwner({ async get() { return { [ownerKey]: '  Coworker Name  ' }; } }), 'Coworker Name');
});

test('saved owner overrides agent plans without writing settings', async () => {
  const previous = globalThis.chrome;
  globalThis.chrome = { storage: { local: { async get() { return { [ownerKey]: 'Coworker Name' }; } } } };
  try {
    const plan = { ticket: { owner: 'Old Owner' }, tickets: [{ ticket: { owner: 'Old Owner' } }],
      steps: [{ action: 'set-ticket-owner-and-verify', owner: 'Old Owner' }] };
    await applyTicketOwner(plan);
    assert.equal(plan.ticket.owner, 'Coworker Name');
    assert.equal(plan.tickets[0].ticket.owner, 'Coworker Name');
    assert.equal(plan.steps[0].owner, 'Coworker Name');
  } finally { globalThis.chrome = previous; }
});
