import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
function ready(read){let opens=0,reads=0;const ctx={chrome:{runtime:{onMessage:{addListener(){}}}},setTimeout:fn=>fn(),open:async({ticketId,numberOnly})=>{opens++;assert.equal(ticketId,456);},read:async()=>read(++reads)};return{promise:runInNewContext(source+';openRakeNumberInTab=open;inspectTicketInTab=read;readRakeTicketInTab({tabId:1,ticketId:456,company:"Expected Company"})',ctx),get opens(){return opens},get reads(){return reads}};}
const fields={ok:true,ticketId:456,matches:true,company:'Expected Company',summary:'T-123',status:'Working Issue Now'};
test('rake waits for blank Company and Status instead of reporting a different company',async()=>{const r=ready(n=>n<12?{...fields,company:'',status:null}:fields);const result=await r.promise;assert.equal(result.ok,true);assert.equal(r.opens,1);assert.ok(r.reads>=15);});
test('Company comparison normalizes whitespace and case without accepting another company',async()=>{const r=ready(()=>({...fields,company:' expected   COMPANY '}));assert.equal((await r.promise).ok,true);});
test('real Company mismatch reports expected and actual values without saving',async()=>{const r=ready(()=>({...fields,company:'Other Company'}));await assert.rejects(r.promise,/expected "Expected Company", read "Other Company"/);assert.equal(r.reads,120);assert.equal(r.opens,1);});
test('incomplete Company is reported as not loaded, not a different company',async()=>{const r=ready(()=>({...fields,company:null}));await assert.rejects(r.promise,/did not finish loading/);});
test('rake requires stable current fields before returning',async()=>{const r=ready(n=>({...fields,status:n<8?(n%2?'Working Issue Now':'Scheduled Onsite'):'Completed'}));assert.equal((await r.promise).status,'Completed');assert.ok(r.reads>=11);});

test('recorded-number navigation uses the observed CW ticket page route, including closed records',async()=>{
 let navigated;const ctx={URL,chrome:{runtime:{onMessage:{addListener(){}}},tabs:{get:async()=>({url:'https://na.myconnectwise.net/v2025_1/ConnectWise.aspx?locale=en_US#old'}),update:async(id,value)=>{assert.equal(id,7);navigated=value;}}},validate:async()=>{}};
 await runInNewContext(source+';connectwiseTab=validate;openRakeNumberInTab({tabId:7,ticketId:456});',ctx);
 const url=new URL(navigated.url);assert.equal(url.pathname,'/v2025_1/ConnectWise.html');assert.equal(url.searchParams.get('routeTo'),'ServiceFV');assert.equal(url.searchParams.get('srRecID'),'456');assert.equal(navigated.active,true);assert.equal(url.hash,'');
});
test('invalid recorded IDs stop before navigation',async()=>{const ctx={chrome:{runtime:{onMessage:{addListener(){}}}}};await assert.rejects(runInNewContext(source+';openRakeNumberInTab({tabId:7,ticketId:0});',ctx),/positive recorded/);});
