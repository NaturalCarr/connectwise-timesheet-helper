import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planDay,planWeek} from '../extension/plan.mjs';
import {plannedReports} from '../extension/planned-eod.mjs';
import {renderReport,combinedReports} from '../extension/workflow.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const settings={...read('ticket-settings.json'),owner:'Test Engineer'};

test('report exclusion preserves time records and omits tickets from planned and verified reports',()=>{
 const input=read('examples/daily.example.json');input.exampleOnly=false;
 input.items[0].omitFromEod=true;
 const plan=planDay(input,settings),timeCount=plan.totalEntries;
 assert.equal(plan.tickets[0].omitFromEod,true);
 assert.equal(plan.tickets[0].timeEntries.length,input.items[0].timeEntries.length);
 assert.equal(plannedReports(plan)[0].tickets.length,plan.tickets.length-1);
 const run={plan,updatedAt:'2026-10-14T22:00:00Z',result:{results:plan.tickets.map((t,i)=>({ticketId:i+1,summary:t.ticket.summary,status:'completed_verified',ticketStatus:t.completedStatus,entries:t.timeEntries.map(e=>({...e,status:'saved_verified'}))}))}};
 assert.equal(combinedReports([run])[0].tickets.length,plan.tickets.length-1);
 assert.equal(plan.totalEntries,timeCount);
 input.items[0].omitFromEod='true';assert.throws(()=>planDay(input,settings),/must be a boolean/);
});
test('JSON-only Daily Report works without saved results and keeps planned status distinct',()=>{
 for(const [file,planner] of [['extension/DAILY-EXAMPLE.json',planDay],['extension/WEEKLY-EXAMPLE.json',planWeek]]){
  const plan=planner(read(file),settings),before=JSON.stringify(plan),reports=plannedReports(plan);
  assert.ok(reports.length);assert.equal(JSON.stringify(plan),before);
  for(const r of reports){assert.equal(r.verification,'planned');assert.ok(r.tickets.every(t=>!t.ticketId));assert.match(r.html,/<table/);assert.doesNotMatch(r.html,/planned-row-/);assert.equal(renderReport(r),r.html);}
  assert.ok(reports.some(r=>r.html.includes('2 x M1, 1 x M4')));
 }
});
test('planned Daily Report includes DITL work and excludes wrap from mixed tickets',()=>{
 const plan={mode:'daily',date:'2026-10-21',endOfDay:{subject:'Test',tickets:[{notes:'Wrap.\nFixed printing.'},{notes:'Huddle'}]},tickets:[{ticket:{summary:'Printing'},completedStatus:'Completed',timeEntries:[{date:'2026-10-21',workType:'Payroll Wrap',notes:'Wrap.'},{date:'2026-10-21',workType:'Onsite Support',notes:'Fixed printing.'}]},{ticket:{summary:'School - DITL'},completedStatus:'Completed',timeEntries:[{date:'2026-10-21',workType:'Onsite Support',notes:'Huddle'}]}]};
 const r=plannedReports(plan)[0];assert.equal(r.tickets.length,2);assert.match(r.html,/Fixed printing/);assert.match(r.html,/DITL/);assert.match(r.html,/Huddle/);assert.doesNotMatch(r.html,/Wrap/);
});
