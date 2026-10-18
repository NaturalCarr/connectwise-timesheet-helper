import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServiceRosterCsv, inspectGoogleContactsCsv, inspectWorkspaceUsersCsv, parseCsv } from '../src/google-contacts.mjs';

test('Google Contacts CSV inspection finds site candidates without exposing names or email values', () => {
  const csv = '\uFEFFName,E-mail 1 - Value,Organization 1 - Name,Organization 1 - Department,Labels,Custom Field 1 - Value\r\n'
    + 'Alex Example,alex@example.org,Example Public Schools,SCHB,Staff ::: SCHB,Campus A\r\n'
    + '"Sam, Example",sam@example.org,Example Public Schools,SCHE,Staff ::: SCHE,Campus B\r\n';
  const result = inspectGoogleContactsCsv(csv);
  assert.equal(result.contactCount, 2);
  assert.ok(result.candidateSiteValues.some(({ value, count }) => value === 'Example Public Schools' && count === 2));
  assert.ok(result.candidateSiteValues.some(({ value }) => value === 'SCHB'));
  assert.ok(result.candidateSiteValues.some(({ value }) => value === 'Campus B'));
  assert.ok(!JSON.stringify(result.candidateSiteValues).includes('alex@example.org'));
  assert.ok(!JSON.stringify(result.candidateSiteValues).includes('Sam, Example'));
});

test('CSV parser handles quoted commas, newlines, and escaped quotes', () => {
  assert.deepEqual(parseCsv('Name,Notes\n"A, B","Line 1\nLine ""2"""\n'), [
    ['Name', 'Notes'], ['A, B', 'Line 1\nLine "2"']
  ]);
  assert.throws(() => parseCsv('Name\n"unfinished'), /unclosed/);
});

test('Google Admin users export exposes school fields without explicit names or emails', () => {
  const csv = 'First Name [Required],Last Name [Required],Email Address [Required],Password [Required],Org Unit Path [Required],Department,Building ID,Employee Title,Manager Email\n'
    + 'Alex,Example,alex@example.org,,/Schools/Example North High School/SCHB - Staff,Education,Example North High School,Teacher,boss@example.org\n'
    + 'Sam,Example,sam@example.org,,/Schools/Example South High School/SCHE - Staff,Education,Example South High School,Dean,boss@example.org\n';
  const result = inspectWorkspaceUsersCsv(csv);
  assert.equal(result.userCount, 2);
  assert.ok(result.candidateSiteValues.some(({ value }) => value.includes('SCHB - Staff')));
  assert.ok(result.candidateSiteValues.some(({ value }) => value === 'Example South High School'));
  assert.deepEqual(result.schoolCandidates, [
    { acronym: 'SCHB', organization: 'Example North High School', userCount: 1 },
    { acronym: 'SCHE', organization: 'Example South High School', userCount: 1 }
  ]);
  assert.ok(!JSON.stringify(result.candidateSiteValues).includes('alex@example.org'));
  const roster = buildServiceRosterCsv(csv);
  assert.equal(roster.users.length, 2);
  assert.equal(roster.users[0].acronym, 'SCHB');
  assert.equal(roster.users[1].organization, 'Example South High School');
  assert.ok(!JSON.stringify(roster).includes('Password'));
  assert.throws(() => inspectWorkspaceUsersCsv('Name,Address\nA,Unknown'), /look like a Google Admin/);
});
