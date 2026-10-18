import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('extension uses CLI ticket defaults except the required per-user owner', async () => {
  const [cli, browser] = await Promise.all([
    readFile(new URL('../ticket-settings.json', import.meta.url), 'utf8'),
    readFile(new URL('../extension/ticket-settings.json', import.meta.url), 'utf8')
  ]);
  assert.deepEqual(JSON.parse(browser), { ...JSON.parse(cli), owner: '' });
});
