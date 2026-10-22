import test from 'node:test';
import assert from 'node:assert/strict';
import { combinedReports,renderReport } from '../extension/workflow.mjs';
import { reportsByDay } from '../extension/daily-report.mjs';
const time=(start,end,notes,workType='Payroll Wrap')=>({date:'2026-10-21',start,end,notes,workType});
function fixture(mode='daily'){
 const timeEntries=[time('09:00','09:20','Private administrative interval'),time('13:00','13:30','Lunch.'),time('15:00','15:30','Configured printer.','Onsite Support')];
 const plan={mode,date:'2026-10-21',endOfDay:{subject:'Update',tickets:[{notes:'Private administrative interval\nLunch.\nConfigured printer.',status:'Completed'}]},tickets:[{ticket:{summary:'Printing'},completedStatus:'Completed',timeEntries}]};
 const result={ok:true,results:[{ticketId:123,summary:'Printing',ticketStatus:'Completed',status:'completed_verified',entries:timeEntries.map(e=>({...e,status:'saved_verified'}))}]};return {plan,result};
}
test('daily, weekly and historical reports exclude wrap regardless of ticket and keep work notes',()=>{
 for(const mode of ['daily','weekly']){const {plan,result}=fixture(mode);const reports=reportsByDay(plan,result);assert.match(reports[0].html,/Configured printer/);assert.doesNotMatch(reports[0].html,/Private administrative|Lunch|Payroll Wrap/);const combined=combinedReports([{plan,result,updatedAt:'2026-10-21T20:00:00Z'}]);assert.match(combined[0].html,/Configured printer/);assert.doesNotMatch(combined[0].html,/Private administrative|Lunch|Payroll Wrap/);assert.equal(plan.tickets[0].timeEntries.length,3);}
});
test('legacy include setting and payroll payload never render, including DITL-only history',()=>{
 const {plan,result}=fixture();plan.tickets[0].ticket.summary='School - DITL';result.results[0].summary='School - DITL';const ditl=combinedReports([{plan,result,updatedAt:'2026-10-21T20:00:00Z'}]);assert.match(ditl[0].html,/School - DITL/);assert.match(ditl[0].html,/Configured printer/);assert.doesNotMatch(ditl[0].html,/Private administrative|Lunch|Payroll Wrap/);
 const html=renderReport({date:'2026-10-21',subject:'Update',includePayrollWrap:true,payrollWrap:[{start:'09:00',end:'09:20',notes:'Legacy wrap'}],tickets:[{ticketId:123,summary:'Printing',status:'Completed',notes:'Configured printer.\nPayroll Wrap.\nWrap.',nextStep:''}]});assert.match(html,/Configured printer/);assert.doesNotMatch(html,/Legacy wrap|Payroll Wrap|09:00|<li>Wrap/);
});

test('daily and weekly DITL reports retain work while excluding wrap and lunch',()=>{for(const mode of ['daily','weekly']){const {plan,result}=fixture(mode);plan.tickets[0].ticket.summary='School - DITL';result.results[0].summary='School - DITL';const r=reportsByDay(plan,result)[0];assert.equal(r.tickets.length,1);assert.match(r.html,/School - DITL/);assert.match(r.html,/Configured printer/);assert.doesNotMatch(r.html,/Private administrative|Lunch|Payroll Wrap/);}});
