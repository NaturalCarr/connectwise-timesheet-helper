import test from 'node:test';
import assert from 'node:assert/strict';
import { configFields, configKey, configuredDefaults, validateDefaults } from '../extension/config-settings.mjs';
test('saved configuration overlays packaged defaults without changing owner', async () => {
 const values = Object.fromEntries(configFields.map(k => [k, ' Custom ' + k + ' ']));
 const settings = await configuredDefaults({owner:'Person'}, {get:async()=>({[configKey]:values})});
 assert.equal(settings.company,'Custom company'); assert.equal(settings.owner,'Person');
 assert.throws(()=>validateDefaults({...values, company:' '}), /company is required/);
});
test('no configuration preserves packaged defaults', async () => {
 assert.deepEqual(await configuredDefaults({company:'Example'}, {get:async()=>({})}), {company:'Example'});
});
