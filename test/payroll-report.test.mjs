import test from 'node:test';
import assert from 'node:assert/strict';
import { combinedReports,renderReport } from '../extension/workflow.mjs';
const entry=(start,end,notes='Wrap.')=>({date:'2026-10-21',start,end,notes,workType:'Payroll Wrap'});
test('verified DITL wrap is included by default, can be hidden, and excludes lunch and pending saves',()=>{
 const plan={mode:'daily',date:'2026-10-21',tickets:[{ticket:{summary:'School - DITL'},timeEntries:[entry('09:00','09:20'),entry('13:00','13:30','Lunch.'),entry('15:00','15:10')]}]};
 const result={results:[{ticketId:123,summary:'School - DITL',status:'stopped',entries:[{status:'saved_verified'},{status:'saved_verified'},{status:'pending'}]}]};
 const report=combinedReports([{plan,result,updatedAt:'2026-10-21T20:00:00Z'},{plan,result,updatedAt:'2026-10-21T21:00:00Z'}])[0];
 assert.equal(report.tickets.length,0);assert.equal(report.payrollWrap.length,1);assert.match(report.html,/Payroll Wrap/);assert.match(report.html,/09:00–09:20/);assert.doesNotMatch(report.html,/Lunch|15:00/);
 assert.doesNotMatch(renderReport({...report,includePayrollWrap:false}),/Payroll Wrap|09:00/);
 assert.equal(report.payrollWrap.length,1);
});
