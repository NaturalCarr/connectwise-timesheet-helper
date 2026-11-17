import test from 'node:test';
import assert from 'node:assert/strict';
import { configFields, configKey, configuredDefaults, validateDefaults, rememberJsonSchools } from '../extension/config-settings.mjs';
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

test('JSON pairs are learned and retained without replacing existing mappings',async()=>{
 const settings={...Object.fromEntries(configFields.map(key=>[key,'Example'])),company:'Client'};let saved={},writes=0;const storage={get:async()=>saved,set:async value=>{saved=value;writes++;}};
 const record={items:[{school:' sch ',site:'North Campus'},{school:'SCH',site:'North Campus'},{school:'OTHER'}]};
 assert.equal(await rememberJsonSchools(record,settings,storage),1);assert.equal(writes,1);assert.deepEqual(saved[configKey].schoolMappings,[{acronym:'SCH',company:'Client',site:'North Campus'}]);
 assert.equal(await rememberJsonSchools(record,settings,storage),0);assert.equal(writes,1);
 await assert.rejects(rememberJsonSchools({items:[{school:'NEW',site:'East'},{school:'SCH',site:'Wrong'}]},settings,storage),/mapping conflict/);assert.equal(writes,1);
 assert.equal(await rememberJsonSchools({...record,exampleOnly:true},settings,storage),0);assert.equal(writes,1);
});
