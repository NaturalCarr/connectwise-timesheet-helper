import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planDay,planWeek} from '../extension/plan.mjs';
import {plannedReports} from '../extension/planned-eod.mjs';
import {renderReport} from '../extension/workflow.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const settings={...read('ticket-settings.json'),owner:'Test Engineer'};
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
