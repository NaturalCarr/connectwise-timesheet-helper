import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupServiceUser } from '../src/roster.mjs';

const roster = { schemaVersion: 1, users: [
  { name: 'Alex Example', email: 'alex@example.org', acronym: 'SCHB', organization: 'Example North' },
  { name: 'Sam Example', email: 'sam@example.org', acronym: 'SCHE', organization: 'Example South' },
  { name: 'Sam Example', email: 'sam2@example.org', acronym: 'SCHE', organization: 'Example South' }
] };

test('exact user lookup returns one school association or an explicit ambiguity', () => {
  assert.equal(lookupServiceUser(roster, 'ALEX@EXAMPLE.ORG').user.acronym, 'SCHB');
  assert.equal(lookupServiceUser(roster, 'Alex Example').user.email, 'alex@example.org');
  const ambiguous = lookupServiceUser(roster, 'Sam Example');
  assert.equal(ambiguous.ambiguous, true);
  assert.equal(ambiguous.candidates.length, 2);
  assert.equal(lookupServiceUser(roster, 'Unknown').found, false);
});
