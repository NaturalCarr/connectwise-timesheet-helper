import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planDay, planWeek } from '../extension/plan.mjs';
import { reportsByDay } from '../extension/daily-report.mjs';
import { combinedReports } from '../extension/workflow.mjs';
import { normalizeEodExtras } from '../extension/eod-extras.mjs';
const load=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const settings={...load('ticket-settings.json'),owner:'Test Engineer'};
const execution=plan=>({ok:true,results:plan.tickets.map((item,index)=>({ticketId:100+index,summary:item.ticket.summary,ticketStatus:item.completedStatus,status:'completed_verified',entries:item.timeEntries.map(entry=>({...entry,status:'saved_verified'}))}))});
test('daily JSON inventory reaches execution EoD and combined history without creating time',()=>{
 const input=load('extension/DAILY-EXAMPLE.json');const plan=planDay(input,settings);const result=execution(plan);
 const report=reportsByDay(plan,result)[0];assert.match(report.html,/2 x M1, 1 x M4/);assert.match(report.html,/Chromebooks/);assert.match(report.html,/USB-C adapter × 2/);
 const combined=combinedReports([{plan,result,updatedAt:'2026-10-20T20:00:00Z'}]);assert.match(combined[0].html,/2 x M1, 1 x M4/);
 assert.equal(plan.totalEntries,input.items.reduce((n,item)=>n+item.timeEntries.length,0));
 assert.throws(()=>planDay({...input,endOfDay:{inventory:[{item:'MacBooks',quantity:-1}]}},settings),/nonnegative/);
});
test('weekly inventory remains tied to its report date and rejects duplicate dates',()=>{
 const input=load('extension/WEEKLY-EXAMPLE.json');const plan=planWeek(input,settings);const reports=reportsByDay(plan,execution(plan));const target=reports.find(r=>r.date===input.endOfDays[0].date);assert.match(target.html,/2 x M1, 1 x M4/);
 for(const other of reports.filter(r=>r.date!==target.date))assert.doesNotMatch(other.html,/<h3>Inventory/);
 assert.throws(()=>planWeek({...input,endOfDays:[input.endOfDays[0],input.endOfDays[0]]},settings),/Duplicate EoD/);
});
test('Mac count details normalize consistently without changing counts',()=>{
 assert.deepEqual(normalizeEodExtras({inventory:[{item:'MacBooks',quantity:4,model:'M1'},{item:'MacBooks',quantity:1,model:'M4'},{item:'Chromebooks',quantity:10}]}).inventory,[{item:'MacBooks',count:'4 x M1, 1 x M4'},{item:'Chromebooks',count:'10'}]);
});
