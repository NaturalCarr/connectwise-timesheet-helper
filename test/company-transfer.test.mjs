import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
const ticket={company:'Target Company',site:'Target Site',contact:'Target Contact',agreement:'Target Agreement'};
async function run({same=false,badDraft=false,badSaved=false,pending=null}={}){
 let waits=0,saves=0,reloads=0;const events=[];
 const ctx={ticket,events,setTimeout:fn=>fn(),chrome:{runtime:{onMessage:{addListener(){}}}},
 wait:async()=>{if(++waits===1&&!same)throw Object.assign(new Error('Mismatch'),{companyMismatch:true});return{target:{tabId:1,frameIds:[0]}};},
 frame:async()=>({frameId:0,state:{company:'Source Company',status:'Working Issue Now'}}),
 read:async({func,args})=>{events.push(func.name);if(func.name==='companyTransferDraft')return[{result:pending}];if(func.name==='locateCompanySuggestion')return[{result:{found:true}}];if(func.name==='inspectSchoolSite')return[{result:{verified:false}}];if(func.name==='inspectTransferFields')return[{result:{verified:reloads?!badSaved:!badDraft}}];return[{result:{verified:true}}];},
 text:async()=>events.push('type-company'),click:async(...args)=>{assert.equal(args[2],42);events.push('select-company');},option:async(...args)=>events.push(args[2]),site:async()=>events.push('select-site'),save:async()=>{saves++;events.push('save');},reload:async()=>{reloads++;events.push('reload');}};
 const promise=runInNewContext(source+';waitForSchoolSiteContext=wait;matchingFrame=frame;executeConnectWiseScript=read;trustedTicketText=text;trustedTicketControlClick=click;chooseTicketOptionInTab=option;selectSchoolSite=site;trustedTicketSave=save;reloadConnectWiseSafely=reload;ensureTicketCompanyInTab({tabId:1,ticketId:42,ticket});',ctx);
 return {promise,events,saves:()=>saves,reloads:()=>reloads};
}
test('Company transfer saves the same ticket once and verifies after reload',async()=>{const r=await run();const saved=await r.promise;assert.equal(saved.verified,true);assert.equal(saved.ticketId,42);assert.equal(saved.fromCompany,'Source Company');assert.equal(r.saves(),1);assert.equal(r.reloads(),1);assert.ok(r.events.indexOf('clearStatusEmailRecipients')<r.events.indexOf('save'));assert.ok(r.events.includes('input.cw_contact'));assert.ok(r.events.includes('input.cw_agreement'));});
test('matching Company does not edit or save',async()=>{const r=await run({same:true});assert.equal((await r.promise).alreadySet,true);assert.equal(r.saves(),0);assert.ok(!r.events.includes('type-company'));});
test('unverified transfer fields stop before Save',async()=>{const r=await run({badDraft:true});await assert.rejects(r.promise,/No Save/);assert.equal(r.saves(),0);});
test('post-reload mismatch is never reported as transferred',async()=>{const r=await run({badSaved:true});await assert.rejects(r.promise,/not verified after reload/);assert.equal(r.saves(),1);});
test('uncertain prior transfer Save is not repeated',async()=>{const r=await run({same:true,pending:{phase:'save_attempted'}});await assert.rejects(r.promise,/no repeat Save/);assert.equal(r.saves(),0);});
