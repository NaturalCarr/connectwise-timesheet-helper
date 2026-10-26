import { isPayrollWrap, workReportNotes, cleanEodNotes } from './payroll-report.mjs';
import { renderPlannedEod } from './eod-model.mjs';
export function plannedReports(plan) {
 const dates=[...new Set(plan.tickets.flatMap(item=>item.timeEntries.map(entry=>entry.date)))].sort();
 return dates.map(date=>{
  const details=plan.mode==='daily'?plan.endOfDay:plan.endOfDays?.find(day=>day.date===date);
  const tickets=[];
  plan.tickets.forEach((item,index)=>{
   const entries=item.timeEntries.filter(entry=>entry.date===date && !isPayrollWrap(entry));
   if(!entries.length || /payroll\s+wrap/i.test(item.ticket.summary))return;
   const daily=plan.mode==='daily'?plan.endOfDay?.tickets[index]:null;
   const notes=workReportNotes({...item,timeEntries:item.timeEntries},daily?.notes || entries.map(e=>e.notes).join('\n'));
   if(!notes)return;
   tickets.push({titleContains:'planned-row-'+index,summary:item.ticket.summary,status:item.completedStatus || item.ticket.status,notes,nextStep:cleanEodNotes(daily?.nextStep || entries.map(e=>e.followUp || '').filter(Boolean).join('\n'))});
  });
  const report={date,subject:details?.subject || 'Daily Report - '+date,docCams:details?.docCams,inventory:details?.inventory || [],purchases:details?.purchases || [],tickets,verification:'planned'};
  return {...report,html:renderPlannedEod(report)};
 });
}
export async function openPlannedEod(plan) {
 const id=crypto.randomUUID();
 await chrome.storage.local.set({['plannedEod:'+id]:plan});
 await chrome.tabs.create({url:chrome.runtime.getURL('planned-eod.html#'+id),active:true});
}
