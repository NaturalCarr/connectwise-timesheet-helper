import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOpenRakeReferences, iiqReferences, mapIiqStatus, collectRakeReferences, validateRakeInput, previewRake, applyRake } from '../extension/rake-model.mjs';
const url='https://school.incidentiq.com/agent/tickets/11111111-1111-1111-1111-111111111111';
const input={schemaVersion:'1.0',direction:'IIQ_TO_CW',tickets:[{reference:'T-123',cwTicketIds:[456]}]};
function browser(){let writes=[];return{writes,readIiq:async reference=>({reference,status:'Resolved',url,observedAt:'2026-11-13T20:00:00Z'}),resolveCw:async()=>[456],readCw:async ticketId=>({ticketId,summary:'IIQ - T-123 - Copier',status:'Working Issue Now'}),setCwStatus:async(ticketId,status)=>{writes.push({ticketId,status});return{saved:true,status};}};}
for(const [source,target] of [['Resolved','Completed'],['Closed','Closed'],['In Progress','Working Issue Now'],['Waiting on Requestor','Waiting Client Response'],['Waiting on Copier Vendor','Waiting on 3rd Party'],['Waiting on Cabling Vendor','Waiting on 3rd Party'],['Scheduled Onsite~','Scheduled Onsite'],['Pending Closure','Pending Closure']])test('status map '+source,()=>assert.equal(mapIiqStatus(source).status,target));
test('ambiguous IIQ statuses require explicit review',()=>{for(const s of ['On Hold','Submitted','New custom state'])assert.equal(mapIiqStatus(s).status,null);});
test('ticket references are whole numbers, case insensitive, deduplicated',()=>assert.deepEqual(iiqReferences('T-123, t-123, T-1234'),['T-123','T-1234']));
test('reverse direction is rejected',()=>assert.throws(()=>validateRakeInput({...input,direction:'CW_TO_IIQ'}),/IIQ_TO_CW/));
test('duplicate refs, malformed refs, and invalid CW ids rejected',()=>{for(const tickets of [[input.tickets[0],input.tickets[0]],[{reference:'123'}],[{reference:'T-1',cwTicketIds:[0]}]])assert.throws(()=>validateRakeInput({...input,tickets}));});
test('history collects unique handled references and retains duplicate CW identities for review',()=>{const runs=[{id:'a',updatedAt:'2026-11-12',plan:{tickets:[{ticket:{titleContains:'T-123'}}]},result:{results:[{ticketId:456,summary:'Imported ticket'}]}},{id:'b',updatedAt:'2026-11-13',plan:{tickets:[]},result:{results:[{ticketId:789,summary:'T-123 Copier'},{ticketId:999,summary:'T-124 Screen'},{ticketId:null,summary:'T-125 never created'},{ticketId:1000,summary:'DITL'}]}}];const rows=collectRakeReferences(runs);assert.equal(rows.length,2);assert.deepEqual(rows.find(r=>r.reference==='T-123').cwTicketIds,[456,789]);assert.equal(collectRakeReferences(runs,{mode:'recent',limit:1}).length,1);});
test('preview reads fresh source and CW but never saves',async()=>{const d=browser(),p=await previewRake(input,d);assert.equal(p.rows[0].targetStatus,'Completed');assert.equal(p.rows[0].state,'change');assert.deepEqual(d.writes,[]);});
test('ambiguous CW lookup blocks rather than choosing the known id',async()=>{const d=browser();d.resolveCw=async()=>[456,789];const p=await previewRake({...input,tickets:[{reference:'T-123',cwTicketIds:[]}]},d);assert.equal(p.rows[0].state,'blocked');assert.deepEqual(d.writes,[]);});
test('recorded CW number is primary and is not replaced by a title search',async()=>{const d=browser();let searches=0;d.resolveCw=async()=>{searches++;return[789];};const p=await previewRake(input,d);assert.equal(p.rows[0].state,'change');assert.equal(p.rows[0].ticketId,456);assert.equal(p.rows[0].matchMethod,'recorded-id');assert.equal(searches,0);});
test('reference prefix cannot verify a different ticket',async()=>{const d=browser();d.readCw=async()=>({ticketId:456,summary:'T-1234',status:'Working Issue Now'});assert.equal((await previewRake(input,d)).rows[0].state,'blocked');});
test('unknown status remains unselected until reviewed',async()=>{const d=browser();d.readIiq=async reference=>({reference,status:'On Hold',url});const p=await previewRake(input,d);assert.equal(p.rows[0].state,'review');assert.equal(p.rows[0].selected,false);assert.equal(p.rows[0].targetStatus,null);});
test('matching current status is unchanged and unselected',async()=>{const d=browser();d.readCw=async ticketId=>({ticketId,summary:'T-123',status:'Completed~'});assert.equal((await previewRake(input,d)).rows[0].state,'skipped');});
test('apply performs only CW status saves and verifies their receipt',async()=>{const d=browser(),p=await previewRake(input,d);const r=await applyRake(p,d);assert.equal(r.ok,true);assert.equal(r.results[0].state,'saved_verified');assert.deepEqual(d.writes,[{ticketId:456,status:'Completed'}]);});
test('changed IIQ status stops before any CW write',async()=>{const d=browser(),p=await previewRake(input,d);d.readIiq=async reference=>({reference,status:'Pending Closure',url});const r=await applyRake(p,d);assert.equal(r.ok,false);assert.deepEqual(d.writes,[]);});
test('changed IIQ tenant stops before any CW write',async()=>{const d=browser(),p=await previewRake(input,d);d.readIiq=async reference=>({reference,status:'Resolved',url:url.replace('school.','other.')});assert.equal((await applyRake(p,d)).ok,false);assert.deepEqual(d.writes,[]);});
test('changed CW status or matching results require a new preview',async()=>{for(const which of ['status','matches']){const d=browser(),p=await previewRake(which==='matches'?{...input,tickets:[{reference:'T-123',cwTicketIds:[]}]}:input,d);if(which==='status')d.readCw=async ticketId=>({ticketId,summary:'T-123',status:'Scheduled Onsite'});else d.resolveCw=async()=>[456,789];assert.equal((await applyRake(p,d)).ok,false);assert.deepEqual(d.writes,[]);}});
test('unverified save stops and never reports success',async()=>{const d=browser(),p=await previewRake(input,d);d.setCwStatus=async()=>({saved:false,status:'Completed'});const r=await applyRake(p,d);assert.equal(r.ok,false);assert.equal(r.results[0].state,'stopped');});
test('retry after a prior saved status does not save it again',async()=>{const d=browser(),p=await previewRake(input,d);d.readCw=async ticketId=>({ticketId,summary:'T-123',status:'Completed'});const r=await applyRake(p,d);assert.equal(r.results[0].state,'skipped');assert.deepEqual(d.writes,[]);});
test('example scans and invalid duplicate apply targets stop before writes',async()=>{const d=browser();await assert.rejects(previewRake({...input,exampleOnly:true},d),/Example/);const p=await previewRake(input,d);p.rows.push({...p.rows[0]});await assert.rejects(applyRake(p,d),/duplicate/);assert.deepEqual(d.writes,[]);});
test('cancelled scan and apply do no further ticket work',async()=>{const d=browser();const p=await previewRake(input,d,()=>{},()=>true);assert.equal(p.rows.length,0);assert.equal(p.cancelled,true);const r=await applyRake({direction:'IIQ_TO_CW',openOnly:true,rows:[]},d,()=>{},()=>true);assert.equal(r.cancelled,true);});

test('open backlog ignores historical closed rows and reports unlinked tickets',()=>{
 const p=collectOpenRakeReferences([{ticketId:1,status:'Closed',summary:'T-123'},{ticketId:5,status:'Working Issue Now',summary:'T-125'},{ticketId:4,status:'Scheduled Onsite',summary:'DITL'},{ticketId:3,status:'Working Issue Now',summary:'T-125'}]);
 assert.equal(p.totalOpen,3);assert.equal(p.skipped.length,1);assert.deepEqual(p.tickets,[{reference:'T-125',cwTicketIds:[5,3]}]);assert.equal(collectOpenRakeReferences([{ticketId:2,status:'Working Issue Now',summary:'T-123'},{ticketId:3,status:'Working Issue Now',summary:'T-124'}],1).tickets[0].reference,'T-124');
});
test('closed CW is skipped before reading IIQ',async()=>{const d=browser();d.readCw=async ticketId=>({ticketId,status:'Closed',summary:'T-123'});d.readIiq=()=>{throw Error('must not read');};assert.equal((await previewRake(input,d)).rows[0].state,'skipped');});
test('reassigned ticket is skipped on preview and apply without writes',async()=>{
 const d=browser();d.checkEligible=async()=>({eligible:true});const scoped={...input,resourcesFilter:'*example*'};const p=await previewRake(scoped,d);
 d.checkEligible=async()=>({eligible:false,reason:'No longer assigned'});
 assert.equal((await previewRake(scoped,d)).rows[0].state,'skipped');assert.equal((await applyRake(p,d)).results[0].state,'skipped');assert.deepEqual(d.writes,[]);
});
test('legacy previews cannot apply',async()=>{await assert.rejects(applyRake({direction:'IIQ_TO_CW',rows:[]},browser()),/preview/);});

test('Pending Closure is excluded from backlog, preview and apply',async()=>{
 for(const status of ['Pending Closure','Pending Closure~',' pending closure ']){
 assert.equal(collectOpenRakeReferences([{ticketId:456,summary:'T-123',status}]).tickets.length,0);
 const d=browser(),p=await previewRake(input,d);d.readCw=async ticketId=>({ticketId,summary:'T-123',status});d.readIiq=async reference=>({reference,status:'Resolved',url});
 assert.equal((await previewRake(input,d)).rows[0].state,'skipped');
 assert.equal((await applyRake(p,d)).results[0].state,'skipped');assert.deepEqual(d.writes,[]);
 }
});
