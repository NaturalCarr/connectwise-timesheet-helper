export const isPayrollWrap = entry => /^\$?payroll wrap$/i.test(String(entry.workType || '').trim()) && !/\blunch\b/i.test(String(entry.notes || ''));
export function reportPayroll(plan, execution, date) {
 const rows=[];
 for(const [i,result] of (execution.results || []).entries()) for(const [j,saved] of (result.entries || []).entries()) {
  const entry=plan.tickets[i]?.timeEntries[j];
  if(entry?.date===date && isPayrollWrap(entry) && ['saved_verified','existing_verified'].includes(saved.status))rows.push({ticketId:result.ticketId,date,start:entry.start,end:entry.end,notes:entry.notes});
 }
 return rows;
}
