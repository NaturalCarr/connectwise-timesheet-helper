import test from 'node:test';
import assert from 'node:assert/strict';
import {planWorkItem} from '../extension/plan.mjs';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const settings={...JSON.parse(readFileSync(new URL('../ticket-settings.json',import.meta.url))),company:'Client One',schoolMappings:[{acronym:'SCH',company:'Client One',site:'North Campus'},{acronym:'SCH',company:'Client Two',site:'South Campus'}]};
test('configured acronyms resolve by Company, without built-in schools',()=>{const p=planWorkItem({school:'sch',issue:'Audit'},settings);assert.equal(p.ticket.site,'North Campus');assert.equal(p.ticket.schoolSite,true);assert.equal(planWorkItem({school:'SCH',issue:'Audit'},{...settings,company:'Client Two'}).ticket.site,'South Campus');assert.equal(planWorkItem({school:'HPHS',issue:'Audit'},settings).ticket.site,settings.site);});
test('unknown school retains default; conflicting explicit Site stops',()=>{assert.equal(planWorkItem({school:'OTHER',issue:'Audit'},settings).ticket.site,settings.site);assert.throws(()=>planWorkItem({school:'SCH',issue:'Audit',site:'Wrong'},settings),/Site must/);});
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const base={chrome:{runtime:{onMessage:{addListener(){}}}},setTimeout:fn=>fn()};
test('Site selection opens once and waits after one exact selection',async()=>{let clicks=0,reads=0;const ctx={...base,read:async ({func})=>{if(func.name==='schoolSitePickerStep'){clicks++;return [{result:clicks===1?{opened:true}:{selected:true}}];}reads++;return [{result:{verified:true}}];}};await runInNewContext(source+';executeConnectWiseScript=read;selectSchoolSite(1,0,"Site")',ctx);assert.equal(clicks,2);assert.equal(reads,4);});
test('uncommitted Site selection stops before Save',async()=>{const ctx={...base,read:async()=>[{result:{waiting:true}}]};await assert.rejects(runInNewContext(source+';executeConnectWiseScript=read;selectSchoolSite(1,0,"Site")',ctx),/No Save/);});

test('Site action response is accepted by the runner when already selected',async()=>{
 let listener;const ctx={setTimeout:fn=>fn(),chrome:{runtime:{onMessage:{addListener:fn=>listener=fn}}},read:async()=>[{result:{company:'Democracy Prep Public Schools',verified:true}}],frame:async()=>({frameId:0,state:{status:'Working Issue Now'}})};
 runInNewContext(source+';executeConnectWiseScript=read;matchingFrame=frame;',ctx);
 const result=await new Promise(resolve=>listener({action:'ensureTicketSite',company:'Democracy Prep Public Schools',tabId:1,ticketId:1767401,site:'Democracy Prep Endurance High School'},null,resolve));
 assert.equal(result.ok,true);assert.equal(result.verified,true);assert.equal(result.alreadySet,true);
});
test('changed Site success includes ok only after fresh save and reload verification',async()=>{
 let reads=0,saves=0,reloads=0,listener;const ctx={setTimeout:fn=>fn(),chrome:{runtime:{onMessage:{addListener:fn=>listener=fn}}},read:async({func})=>{if(func.name==='inspectSchoolSite'){reads++;return[{result:{company:'Democracy Prep Public Schools',verified:reads>1}}];}return[{result:{verified:true}}];},frame:async()=>({frameId:0,state:{status:'Working Issue Now'}}),select:async()=>{},clear:async()=>{},save:async()=>saves++,reload:async()=>reloads++};
 runInNewContext(source+';executeConnectWiseScript=read;matchingFrame=frame;selectSchoolSite=select;trustedTicketSave=save;reloadConnectWiseSafely=reload;',ctx);
 const result=await new Promise(resolve=>listener({action:'ensureTicketSite',company:'Democracy Prep Public Schools',tabId:1,ticketId:1767401,site:'Democracy Prep Endurance High School'},null,resolve));
 assert.equal(result.ok,true);assert.equal(result.verified,true);assert.equal(result.saved,true);assert.equal(saves,1);assert.equal(reloads,1);
});
