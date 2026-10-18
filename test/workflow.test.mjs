import test from 'node:test';
import assert from 'node:assert/strict';
import { executePlan } from '../extension/execute-plan.mjs';
import { reviewPlan,resumePlan,combinedReports,mergeEvidence,defaultPresets,diagnostic } from '../extension/workflow.mjs';
const entry={date:'2026-10-16',start:'08:00',end:'08:15',notes:'Actual work',workType:'Onsite Support',workRole:'Onsite Engineer',billable:'AUTO'};
const item={recordId:'a',ticket:{summary:'T-1 - Work',owner:'Person',status:'Working Issue Now'},completedStatus:'Completed',timeEntries:[entry]};
const plan={tickets:[item],exampleOnly:false};
function driver(){let saved=false;const calls=[];return {calls,findTickets:async()=>[{ticketId:123}],createTicket:async()=>{throw Error('Duplicate create');},openTicket:async()=>true,ensureTicketOwner:async()=>true,setTicketStatus:async()=>{},verifyTicketStatus:async()=>true,
findTimeEntries:async()=>saved?[{billable:'B'}]:[],openNewTimeEntry:async()=>{calls.push('new');return true;},fillTimeEntry:async()=>{},verifyTimeDraft:async()=>true,saveTimeEntry:async()=>{saved=true;calls.push('save');},verifyTimeEntry:async()=>({verified:true,billable:'B'})};}
test('checkpoints survive a stop after save and resume reuses the observed ticket and row',async()=>{
 const api=driver();api.verifyTimeEntry=async()=>{throw Error('transient verification failure');};const checkpoints=[];
 const first=await executePlan(plan,api,{onCheckpoint:async value=>checkpoints.push(value)});
 assert.equal(first.ok,false);assert.equal(first.results[0].ticketId,123);assert.equal(first.results[0].entries[0].status,'save_attempted');
 assert.ok(checkpoints.some(c=>c.results[0].entries[0]?.status==='save_attempted'));
 const next=resumePlan(plan,first);assert.equal(next.tickets[0].existingTicketId,123);
 const resumed=await executePlan(next,api,{previous:first});assert.equal(resumed.ok,true);assert.deepEqual(api.calls,['new','save']);assert.equal(resumed.results[0].entries[0].status,'existing_verified');
});
test('completed resume checks exact saved records without status writes or new entries',async()=>{
 const api=driver();const previous=await executePlan(plan,api);api.setTicketStatus=async()=>{throw Error('Must not reopen');};
 const resumed=await executePlan(resumePlan(plan,previous),api,{previous});assert.equal(resumed.ok,true);assert.deepEqual(api.calls,['new','save']);
 api.findTimeEntries=async()=>[];
 const missing=await executePlan(resumePlan(plan,previous),api,{previous});assert.equal(missing.ok,false);assert.match(missing.results[0].error,/missing or ambiguous/);assert.deepEqual(api.calls,['new','save']);
});
test('storage checkpoint failure prevents the first browser write',async()=>{
 const api=driver();api.findTickets=async()=>{throw Error('Browser should not run');};
 await assert.rejects(executePlan(plan,api,{onCheckpoint:async()=>{throw Error('storage full');}}),/storage full/);assert.deepEqual(api.calls,[]);
});
test('verified evidence is retained during interrupted rechecking',()=>{
 const prior={results:[{ticketId:123,status:'completed_verified',ticketStatus:'Completed',entries:[{...entry,status:'saved_verified'}]}]};
 const evidence=mergeEvidence(prior,{results:[{ticketId:123,status:'pending',entries:[]}]});assert.equal(evidence.results[0].status,'completed_verified');assert.equal(evidence.results[0].entries.length,1);
});
test('combined EoD deduplicates retries, includes earlier verified tickets and excludes pending and DITL',()=>{
 const row={ticketId:123,summary:'T-1 - Work',status:'completed_verified',ticketStatus:'Completed',entries:[{...entry,status:'saved_verified'}]};
 const run={updatedAt:'2026-10-16T10:00:00Z',plan,result:{results:[row]}};
 const later={updatedAt:'2026-10-16T11:00:00Z',plan,result:{results:[{...row,ticketId:124,summary:'T-2 - Other work'}]}};
 const ditl={...later,result:{results:[{...row,ticketId:125,summary:'School - DITL'}]}};
 const pending={...later,result:{results:[{...row,ticketId:126,status:'stopped'}]}};
 const report=combinedReports([run,run,later,ditl,pending])[0];assert.equal(report.tickets.length,2);assert.match(report.html,/T-1/);assert.match(report.html,/T-2/);assert.doesNotMatch(report.html,/DITL/);
});
test('review separates AUTO billing, lunch, gaps, overlaps and target shortfall',()=>{
 const review=reviewPlan({tickets:[{...item,timeEntries:[entry,{...entry,start:'09:00',end:'09:30',notes:'Lunch break.',billable:'NB'}]}]});const day=review.days[0];assert.equal(day.totalMinutes,45);assert.equal(day.unknownBillingMinutes,15);assert.equal(day.nonbillableMinutes,30);assert.equal(day.lunchMinutes,30);assert.deepEqual(day.gaps,[{start:495,end:540}]);assert.equal(day.shortfallMinutes,465);
});
test('presets do not invent dates or times; morning huddle is explicitly billable',()=>{
 assert.equal(defaultPresets.find(p=>p.id==='huddle').billable,'B');for(const p of defaultPresets){assert.equal(p.date,undefined);assert.equal(p.start,undefined);assert.equal(p.end,undefined);}
});
test('diagnostics redact URLs, email addresses and credential labels',()=>{
 const info=diagnostic('save',Error('user@example.com token=secret https://host/path?private=1'),123);assert.doesNotMatch(info.message,/secret|example.com|private=1/);assert.equal(info.ticketId,123);
});

test('EoD includes saved work from a stopped partial run after later status verification',()=>{
 const first={updatedAt:'2026-10-16T10:00:00Z',plan,result:{results:[{ticketId:123,summary:'T-1 - Work',status:'stopped',entries:[{...entry,status:'saved_verified'}]}]}};
 const laterEntry={...entry,start:'09:00',end:'09:15',notes:'Later work'};
 const second={updatedAt:'2026-10-16T11:00:00Z',plan:{tickets:[{...item,timeEntries:[laterEntry]}]},result:{results:[{ticketId:123,summary:'T-1 - Work',status:'completed_verified',ticketStatus:'Completed',entries:[{...laterEntry,status:'saved_verified'}]}]}};
 const report=combinedReports([first,second])[0];assert.equal(report.tickets.length,1);assert.match(report.tickets[0].notes,/Actual work/);assert.match(report.tickets[0].notes,/Later work/);
});

test('older final-status evidence cannot certify newer stopped work',()=>{
 const completed={updatedAt:'2026-10-16T10:00:00Z',plan,result:{results:[{ticketId:123,summary:'T-1 - Work',status:'completed_verified',ticketStatus:'Completed',entries:[{...entry,status:'saved_verified'}]}]}};
 const laterEntry={...entry,start:'09:00',end:'09:15',notes:'New uncompleted work'};
 const stopped={updatedAt:'2026-10-16T11:00:00Z',plan:{tickets:[{...item,timeEntries:[laterEntry]}]},result:{results:[{ticketId:123,summary:'T-1 - Work',status:'stopped',entries:[{...laterEntry,status:'saved_verified'}]}]}};
 assert.doesNotMatch(combinedReports([completed,stopped])[0].html,/New uncompleted work/);
});

test('huddle correction changes only unsaved entries, leaving verified or uncertain saves intact',async()=>{
 const {correctPendingHuddles}=await import('../extension/workflow.mjs');
 const p={tickets:[{timeEntries:[{...entry,notes:'Morning huddle',workType:'Staff Meeting'}]}]};
 assert.equal(correctPendingHuddles(p,{results:[{entries:[{status:'saved_verified'}]}]}),false);
 assert.equal(correctPendingHuddles(p,{results:[{entries:[{status:'save_attempted'}]}]}),false);
 assert.equal(correctPendingHuddles(p,{results:[{entries:[{status:'pending'}]}]}),true);
 assert.equal(p.tickets[0].timeEntries[0].workType,'Onsite Support');
});
