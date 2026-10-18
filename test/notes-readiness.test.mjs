import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('time-entry identity is recognized before the Notes editor initializes',()=>{
 const source=readFileSync(new URL('../extension/form-functions.js',import.meta.url),'utf8');
 const charge={value:'Company / 8000010 - SCHC - 10.15.2026 - DITL',getBoundingClientRect(){return {width:100,height:20}}};
 const document={querySelectorAll(selector){return selector==='input.cw_ChargeToTextBox'?[charge]:[];},querySelector(selector){return ['input.cw_startTime','input.cw_endTime'].includes(selector)?{}:null;}};
 const result=runInNewContext(`${source}\ndetectTimeFrame('8000010')`,{document,getComputedStyle(){return {display:'block',visibility:'visible'}}});
 assert.equal(result.matches,true); assert.equal(result.signals.notes,false);
});
test('draft preparation waits for Notes readiness before touching fields',async()=>{
 const source=readFileSync(new URL('../extension/background.js',import.meta.url),'utf8');
 let reads=0; const calls=[];
 const chrome={runtime:{onMessage:{addListener(){}}},tabs:{async get(){return {url:'https://na.myconnectwise.net/ConnectWise.aspx'}}},scripting:{async executeScript({func}){
   if(func.name==='detectTimeFrame')return [{frameId:3,result:{matches:true,signals:{notes:++reads>=4}}}];
   if(func.name==='fillTimeDraft'){assert.ok(reads>=4);calls.push('fill');return [{result:{ok:true,warnings:[]}}];}
   if(func.name==='verifyCompleteTimeDraft')return [{result:{verified:true}}];
   throw Error('Unexpected action '+func.name);
 }}};
 const result=await runInNewContext(`${source}\nchooseTicketOptionInTab=async()=>{};enterNotes=async()=>({ok:true});prepareTimeDraftInTab({tabId:7,ticketId:8000010,entry:{workType:'Onsite Support',billable:'AUTO',notes:'Actual work'}});`,{chrome,detectTimeFrame(){},fillTimeDraft(){},setTimeout(cb){cb()}});
 assert.equal(result.prepared,true); assert.deepEqual(calls,['fill']);
});

