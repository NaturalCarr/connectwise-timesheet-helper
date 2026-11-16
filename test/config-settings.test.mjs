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

test('mapping validation normalizes and persists company-scoped user settings',async()=>{
 const values=Object.fromEntries(configFields.map(key=>[key,'Example']));values.company='Client One';values.schoolMappings=[{acronym:' sch ',company:'Client One',site:'North Campus'},{acronym:'SCH',company:'Client Two',site:'South Campus'}];
 const saved=validateDefaults(values);assert.equal(saved.schoolMappings[0].acronym,'SCH');assert.equal((await configuredDefaults({}, {get:async()=>({[configKey]:saved})})).schoolMappings.length,2);
 assert.throws(()=>validateDefaults({...values,schoolMappings:[...values.schoolMappings,values.schoolMappings[0]]}),/Duplicate acronym/);
 assert.throws(()=>validateDefaults({...values,schoolMappings:[{acronym:'S',company:'Client',site:'Site'}]}),/2-16/);
 assert.throws(()=>validateDefaults({...values,schoolMappings:[{acronym:'SCH',company:'Client',site:''}]}),/Company and Site/);
 assert.deepEqual(validateDefaults({...values,schoolMappings:[]}).schoolMappings,[]);
});
